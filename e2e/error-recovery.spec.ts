import { test, expect, formatSSE, selectModel, submitPrompt, waitForGeneration, ensureModalClosed } from './fixtures';

test.describe('Error Recovery', () => {
    test.beforeEach(async ({ page, mockApi }) => {
        // Set up base mocks BEFORE navigation
        await mockApi.mockModels();
        await mockApi.mockApiKeyExists();

        // Navigate to the page
        await page.goto('/');

        // Wait for page to stabilize and ensure modal is closed
        await page.waitForLoadState('networkidle');
        await ensureModalClosed(page);
    });

    test('should show error for single model failure while continuing others', async ({ page }) => {
        // Mock generate with one model erroring
        await page.route('**/api/generate', async (route) => {
            const body = route.request().postDataJSON();
            let response = '';

            for (const modelId of body.models) {
                response += formatSSE({ type: 'model_start', modelId });

                if (modelId === 'openai/gpt-4') {
                    // This model errors
                    response += formatSSE({
                        type: 'model_error',
                        modelId,
                        error: 'Rate limit exceeded'
                    });
                } else {
                    // Other models succeed
                    response += formatSSE({ type: 'model_chunk', modelId, content: `Success from ${modelId}` });
                    response += formatSSE({
                        type: 'model_complete',
                        modelId,
                        content: `Success from ${modelId}`,
                        tokens: { prompt: 10, completion: 20, total: 30 }
                    });
                }
            }

            response += formatSSE({ type: 'synthesis_start' });
            response += formatSSE({ type: 'synthesis_complete', content: 'Partial synthesis' });
            response += formatSSE({ type: 'complete' });

            await route.fulfill({
                status: 200,
                contentType: 'text/event-stream',
                body: response,
            });
        });

        // Select multiple models
        await selectModel(page, 'GPT-4');
        await selectModel(page, 'Claude 3 Opus');

        // Generate
        await submitPrompt(page, 'Error test');

        // Verify error appears for GPT-4
        await expect(page.getByText(/rate limit/i)).toBeVisible({ timeout: 15000 });

        // Verify Claude still shows success
        await expect(page.getByText(/Success from anthropic\/claude-3-opus/)).toBeVisible();

        // Verify synthesis still completes
        await expect(page.getByText('Partial synthesis')).toBeVisible();
    });

    test('should show error when all models fail', async ({ page }) => {
        await page.route('**/api/generate', async (route) => {
            const body = route.request().postDataJSON();
            let response = '';

            for (const modelId of body.models) {
                response += formatSSE({ type: 'model_start', modelId });
                response += formatSSE({
                    type: 'model_error',
                    modelId,
                    error: 'Service unavailable'
                });
            }

            response += formatSSE({ type: 'error', error: 'All models failed' });
            response += formatSSE({ type: 'complete' });

            await route.fulfill({
                status: 200,
                contentType: 'text/event-stream',
                body: response,
            });
        });

        await selectModel(page, 'GPT-4');
        await submitPrompt(page, 'All fail test');

        // Should show the error message (in prompt-warning div)
        await expect(page.getByText(/all models failed/i)).toBeVisible({ timeout: 15000 });
    });

    test('should handle network error gracefully', async ({ page }) => {
        await page.route('**/api/generate', async (route) => {
            // Return 500 error
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal server error' }),
            });
        });

        await selectModel(page, 'GPT-4');
        await submitPrompt(page, 'Error test');

        // Error message should appear
        await expect(page.locator('.prompt-warning')).toBeVisible({ timeout: 15000 });

        // Submit button should be re-enabled
        await expect(page.locator('.submit-button')).toBeVisible();
    });

    test('should handle rate limiting (429) with error message', async ({ page }) => {
        await page.route('**/api/generate', async (route) => {
            await route.fulfill({
                status: 429,
                contentType: 'application/json',
                headers: { 'Retry-After': '60' },
                body: JSON.stringify({ error: 'Too many requests' }),
            });
        });

        await selectModel(page, 'GPT-4');
        await submitPrompt(page, 'Rate limit test');

        // Should show error about too many requests
        await expect(page.getByText(/too many requests/i)).toBeVisible({ timeout: 15000 });
    });

    test('should warn about context window before submission', async ({ page, mockApi }) => {
        // Clear existing models mock and use a small context model
        await page.unroute('**/api/models');
        await page.route('**/api/models', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        id: 'small/model',
                        name: 'Small Context Model',
                        provider: 'Test',
                        contextWindow: 100, // Very small context
                        pricing: { prompt: 0.01, completion: 0.02 }
                    }
                ]),
            });
        });

        // Reload to get new models
        await page.reload();
        await page.waitForLoadState('networkidle');
        await ensureModalClosed(page);

        // Wait for models to load
        await expect(page.locator('.model-selector')).toBeVisible();

        // Select the small model
        await selectModel(page, 'Small Context Model');

        // Enter a very long prompt (should exceed 100 tokens)
        const longPrompt = 'This is a very long prompt that will exceed the context window. '.repeat(20);
        await page.locator('.prompt-textarea').fill(longPrompt);

        // Mock generate for good measure
        await mockApi.mockGenerate();

        // Submit
        await page.locator('.submit-button').click();

        // Should show context window warning
        await expect(page.getByText(/too long|context/i)).toBeVisible({ timeout: 5000 });
    });

    test('should recover after error and allow new generation', async ({ page, mockApi }) => {
        // First, mock an error response
        await page.route('**/api/generate', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Temporary error' }),
            });
        });

        await selectModel(page, 'GPT-4');
        await submitPrompt(page, 'First attempt');

        // Wait for error
        await expect(page.locator('.prompt-warning')).toBeVisible({ timeout: 15000 });

        // Now mock a success response
        await page.unroute('**/api/generate');
        await mockApi.mockGenerate();

        // Try again with a new prompt
        await page.locator('.prompt-textarea').fill('Second attempt');
        await page.locator('.submit-button').click();

        // Should succeed this time
        await waitForGeneration(page);
        await expect(page.locator('.synthesized-response')).toBeVisible();
    });

    test('should handle synthesis error gracefully', async ({ page }) => {
        await page.route('**/api/generate', async (route) => {
            let response = '';

            // Model succeeds
            response += formatSSE({ type: 'model_start', modelId: 'openai/gpt-4' });
            response += formatSSE({ type: 'model_chunk', modelId: 'openai/gpt-4', content: 'Model response' });
            response += formatSSE({
                type: 'model_complete',
                modelId: 'openai/gpt-4',
                content: 'Model response',
                tokens: { prompt: 10, completion: 20, total: 30 }
            });

            // Synthesis fails
            response += formatSSE({ type: 'synthesis_start' });
            response += formatSSE({ type: 'error', error: 'Synthesis failed' });
            response += formatSSE({ type: 'complete' });

            await route.fulfill({
                status: 200,
                contentType: 'text/event-stream',
                body: response,
            });
        });

        await selectModel(page, 'GPT-4');
        await submitPrompt(page, 'Synthesis fail test');

        // Model response should still be visible (in response-panel)
        await expect(page.getByText('Model response')).toBeVisible({ timeout: 15000 });

        // Error should be shown
        await expect(page.getByText(/synthesis failed/i)).toBeVisible();
    });
});
