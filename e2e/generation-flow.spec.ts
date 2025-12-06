import { test, expect, MOCK_MODELS, selectModel, submitPrompt, waitForGeneration, ensureModalClosed } from './fixtures';

test.describe('Complete Generation Flow', () => {
    test.beforeEach(async ({ page, mockApi }) => {
        // Set up all mocks BEFORE navigation - this is critical
        await mockApi.mockModels();
        await mockApi.mockApiKeyExists();
        await mockApi.mockGenerate();

        // Navigate to the page
        await page.goto('/');

        // Wait for page to stabilize
        await page.waitForLoadState('networkidle');

        // Ensure modal is closed (handles race condition)
        await ensureModalClosed(page);
    });

    test('should complete full generation flow from prompt to synthesis', async ({ page }) => {
        // Wait for models to load
        await expect(page.locator('.model-selector')).toBeVisible();

        // Select a model (GPT-4) - click the model chip
        await selectModel(page, 'GPT-4');

        // Enter prompt and submit
        await submitPrompt(page, 'What is the meaning of life?');

        // Wait for generation to complete
        await waitForGeneration(page);

        // Verify model response content appears
        await expect(page.getByText(/Response from openai\/gpt-4/)).toBeVisible({ timeout: 15000 });

        // Verify synthesis section appears with content
        await expect(page.locator('.synthesized-response')).toBeVisible();
        await expect(page.getByText('Synthesized Response')).toBeVisible();
    });

    test('should show cancel button during generation', async ({ page }) => {
        // Select a model
        await selectModel(page, 'GPT-4');

        // Enter prompt and submit
        await page.locator('.prompt-textarea').fill('Test prompt');
        await page.locator('.submit-button').click();

        // Verify cancel button appears during generation
        await expect(page.locator('.cancel-button')).toBeVisible({ timeout: 5000 });
    });

    test('should handle multiple models simultaneously', async ({ page, mockApi }) => {
        // Re-mock with multiple models - unroute first
        await page.unroute('**/api/generate');
        await page.route('**/api/generate', async (route) => {
            const body = route.request().postDataJSON();

            // Create response for multiple models
            let response = '';
            for (const modelId of body.models) {
                response += `data: ${JSON.stringify({ type: 'model_start', modelId })}\n\n`;
                response += `data: ${JSON.stringify({ type: 'model_chunk', modelId, content: `Response from ${modelId}` })}\n\n`;
                response += `data: ${JSON.stringify({ type: 'model_complete', modelId, content: `Response from ${modelId}`, tokens: { prompt: 10, completion: 20, total: 30 } })}\n\n`;
            }
            response += `data: ${JSON.stringify({ type: 'synthesis_start' })}\n\n`;
            response += `data: ${JSON.stringify({ type: 'synthesis_complete', content: 'Combined synthesis' })}\n\n`;
            response += `data: ${JSON.stringify({ type: 'complete' })}\n\n`;

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
        await submitPrompt(page, 'Multi-model test');

        // Wait for synthesis
        await waitForGeneration(page);

        // Verify both model responses appear
        await expect(page.getByText(/Response from openai\/gpt-4/)).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(/Response from anthropic\/claude-3-opus/)).toBeVisible({ timeout: 15000 });
    });

    test('should cancel generation when cancel button clicked', async ({ page }) => {
        // Use a slower mock that we can cancel - unroute first
        await page.unroute('**/api/generate');
        await page.route('**/api/generate', async (route) => {
            // Don't fulfill immediately - simulate slow response
            await new Promise(resolve => setTimeout(resolve, 5000));
            await route.abort();
        });

        // Select model and start generation
        await selectModel(page, 'GPT-4');
        await submitPrompt(page, 'Cancel test');

        // Wait for cancel button to appear
        const cancelButton = page.locator('.cancel-button');
        await expect(cancelButton).toBeVisible({ timeout: 5000 });

        // Click cancel
        await cancelButton.click();

        // Verify generation stops (submit button should reappear)
        await expect(page.locator('.submit-button')).toBeVisible({ timeout: 5000 });
    });
});
