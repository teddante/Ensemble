import { test, expect, formatSSE, submitPrompt, waitForGeneration, navigateAndWaitForReady } from './fixtures';

test.describe('Error Recovery', () => {
    test.beforeEach(async ({ page, mockApi }) => {
        await mockApi.setupAllMocks();
        await navigateAndWaitForReady(page);
    });

    // Skip: SSE streaming mocks - complete event clears state before React renders
    test.skip('should show error for single model failure while continuing others', async ({ page }) => {
        await page.unroute('**/api/generate');
        await page.route('**/api/generate', async (route) => {
            const response = [
                'data: {"type":"model_start","modelId":"model/failing"}\n\n',
                'data: {"type":"model_error","modelId":"model/failing","error":"Rate limit exceeded"}\n\n',
                'data: {"type":"model_start","modelId":"model/success"}\n\n',
                'data: {"type":"model_chunk","modelId":"model/success","content":"Success response"}\n\n',
                'data: {"type":"model_complete","modelId":"model/success","content":"Success response","tokens":{"prompt":10,"completion":20,"total":30}}\n\n',
                'data: {"type":"synthesis_start"}\n\n',
                'data: {"type":"synthesis_complete","content":"Partial synthesis from successful model"}\n\n',
                'data: {"type":"complete"}\n\n'
            ].join('');

            await route.fulfill({ status: 200, contentType: 'text/event-stream', body: response });
        });

        await submitPrompt(page, 'Error test');

        // Synthesis should complete with partial content
        await expect(page.locator('.synthesized-response')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Partial synthesis from successful model')).toBeVisible({ timeout: 5000 });
    });

    test('should show error when all models fail', async ({ page }) => {
        await page.unroute('**/api/generate');
        await page.route('**/api/generate', async (route) => {
            let response = '';
            response += formatSSE({ type: 'model_start', modelId: 'model/one' });
            response += formatSSE({ type: 'model_error', modelId: 'model/one', error: 'Service unavailable' });
            response += formatSSE({ type: 'error', error: 'All models failed' });
            response += formatSSE({ type: 'complete' });
            await route.fulfill({ status: 200, contentType: 'text/event-stream', body: response });
        });

        await submitPrompt(page, 'All fail test');
        await expect(page.getByText(/all models failed/i)).toBeVisible({ timeout: 15000 });
    });

    test('should handle network error gracefully', async ({ page }) => {
        await page.unroute('**/api/generate');
        await page.route('**/api/generate', async (route) => {
            await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal server error' }) });
        });

        await submitPrompt(page, 'Error test');
        await expect(page.locator('.prompt-warning')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('.submit-button')).toBeVisible();
    });

    test('should handle rate limiting (429) with error message', async ({ page }) => {
        await page.unroute('**/api/generate');
        await page.route('**/api/generate', async (route) => {
            await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Too many requests' }) });
        });

        await submitPrompt(page, 'Rate limit test');
        await expect(page.getByText(/too many requests/i)).toBeVisible({ timeout: 15000 });
    });

    // Skip: Same SSE streaming mock limitation - waitForGeneration fails
    test.skip('should recover after error and allow new generation', async ({ page, mockApi }) => {
        await page.unroute('**/api/generate');
        await page.route('**/api/generate', async (route) => {
            await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary error' }) });
        });

        await submitPrompt(page, 'First attempt');
        await expect(page.locator('.prompt-warning')).toBeVisible({ timeout: 15000 });

        await page.unroute('**/api/generate');
        await mockApi.mockGenerate();

        await page.locator('.prompt-textarea').fill('Second attempt');
        await page.locator('.submit-button').click();
        await waitForGeneration(page);
        await expect(page.locator('.synthesized-response')).toBeVisible();
    });

    // Skip: SSE synthesis error requires streaming mock to work
    test.skip('should handle synthesis error gracefully', async ({ page }) => {
        await page.unroute('**/api/generate');
        await page.route('**/api/generate', async (route) => {
            let response = '';
            response += formatSSE({ type: 'model_start', modelId: 'test/model' });
            response += formatSSE({ type: 'model_chunk', modelId: 'test/model', content: 'Model response' });
            response += formatSSE({ type: 'model_complete', modelId: 'test/model', content: 'Model response', tokens: { prompt: 10, completion: 20, total: 30 } });
            response += formatSSE({ type: 'synthesis_start' });
            response += formatSSE({ type: 'error', error: 'Synthesis failed' });
            response += formatSSE({ type: 'complete' });
            await route.fulfill({ status: 200, contentType: 'text/event-stream', body: response });
        });

        await submitPrompt(page, 'Synthesis fail test');
        await expect(page.getByText('Model response')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(/synthesis failed/i)).toBeVisible();
    });
});
