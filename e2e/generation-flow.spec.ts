import { test, expect, submitPrompt, waitForGeneration, navigateAndWaitForReady } from './fixtures';

test.describe('Complete Generation Flow', () => {
    test.beforeEach(async ({ page, mockApi }) => {
        await mockApi.setupAllMocks();
        await navigateAndWaitForReady(page);
    });

    // Skip: SSE streaming mocks don't work correctly with Playwright's route.fulfill()
    // The entire response is sent as one chunk and React state batching clears it before rendering
    test('should complete full generation flow from prompt to synthesis', async ({ page }) => {
        await submitPrompt(page, 'What is the meaning of life?');
        await waitForGeneration(page);
        await expect(page.locator('.synthesized-response')).toBeVisible();
    });

    test('should show cancel button during generation', async ({ page }) => {
        // Mock that keeps the connection open (never resolves)
        await page.unroute('**/api/generate');
        await page.route('**/api/generate', async () => {
            // Never fulfill - keep connection pending forever
        });

        await page.locator('.prompt-textarea').fill('Test prompt');
        await page.locator('.submit-button').click();

        // Cancel button should appear while request is pending
        await expect(page.locator('.cancel-button')).toBeVisible({ timeout: 5000 });
    });

    // Skip: Same SSE streaming mock limitation as above
    test('should handle multiple models simultaneously', async ({ page }) => {
        await submitPrompt(page, 'Multi-model test');
        await waitForGeneration(page);
        await expect(page.locator('.synthesized-response')).toBeVisible();
    });

    test('should cancel generation when cancel button clicked', async ({ page }) => {
        // Mock that keeps connection open
        await page.unroute('**/api/generate');
        await page.route('**/api/generate', async () => {
            // Never fulfill - let the test cancel it
            await new Promise(() => { }); // Never resolves
        });

        await page.locator('.prompt-textarea').fill('Cancel test');
        await page.locator('.submit-button').click();

        await expect(page.locator('.cancel-button')).toBeVisible({ timeout: 5000 });
        await page.locator('.cancel-button').click();
        await expect(page.locator('.submit-button')).toBeVisible({ timeout: 5000 });
    });
});
