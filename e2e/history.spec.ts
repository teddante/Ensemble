import { test, expect, submitPrompt, waitForGeneration, navigateAndWaitForReady } from './fixtures';

test.describe('History Save/Load', () => {
    test.beforeEach(async ({ page, mockApi }) => {
        await mockApi.setupAllMocks();
        await navigateAndWaitForReady(page);
    });

    // Skip: Depends on waitForGeneration which requires SSE streaming
    test.skip('should save generation to history after completion', async ({ page }) => {
        await submitPrompt(page, 'History test prompt');
        await waitForGeneration(page);

        await page.locator('button[aria-label="Open history"]').click();
        await expect(page.locator('.history-sidebar')).toBeVisible();
        await expect(page.locator('.history-prompt')).toContainText('History test prompt');
    });

    // Skip: Depends on waitForGeneration
    test.skip('should load history item when clicked', async ({ page }) => {
        // Generate first
        await submitPrompt(page, 'Loadable prompt');
        await waitForGeneration(page);

        // Ensure synthesized response is visible
        await expect(page.locator('.synthesized-response')).toBeVisible();

        // Wait longer for history to be saved to localStorage
        await page.waitForTimeout(1000);

        // Open sidebar
        await page.locator('button[aria-label="Open history"]').click();
        await expect(page.locator('.history-sidebar')).toBeVisible({ timeout: 5000 });

        // Wait for history items to render
        await expect(page.locator('.history-item')).toHaveCount(1, { timeout: 5000 });

        // Click the history item content area
        await page.locator('.history-item-content').first().click();

        // Sidebar should close after loading
        await expect(page.locator('.history-sidebar')).toBeHidden({ timeout: 10000 });
    });

    // Skip: Depends on waitForGeneration
    test.skip('should delete single history item', async ({ page }) => {
        await submitPrompt(page, 'Entry to delete');
        await waitForGeneration(page);

        await page.locator('button[aria-label="Open history"]').click();
        await expect(page.locator('.history-item')).toHaveCount(1);

        await page.locator('.history-delete').click();
        await expect(page.locator('[role="alertdialog"]')).toBeVisible();
        await page.locator('[role="alertdialog"]').getByRole('button', { name: /delete/i }).click();
        await expect(page.locator('.history-empty')).toBeVisible();
    });

    // Skip: Depends on waitForGeneration
    test.skip('should clear all history', async ({ page }) => {
        await submitPrompt(page, 'Entry to clear');
        await waitForGeneration(page);

        await page.locator('button[aria-label="Open history"]').click();
        await expect(page.locator('.history-item')).toHaveCount(1);

        await page.locator('.history-clear').click();
        await page.locator('[role="alertdialog"]').getByRole('button', { name: /clear all/i }).click();
        await expect(page.locator('.history-empty')).toBeVisible();
    });

    // Skip: Depends on waitForGeneration
    test.skip('should persist history in localStorage', async ({ page }) => {
        await submitPrompt(page, 'Persistence test');
        await waitForGeneration(page);
        await page.waitForTimeout(500);

        const historyData = await page.evaluate(() => window.localStorage.getItem('ensemble_history'));
        expect(historyData).toContain('Persistence test');
    });

    test('should close history sidebar when clicking close button', async ({ page }) => {
        await page.locator('button[aria-label="Open history"]').click();
        await expect(page.locator('.history-sidebar')).toBeVisible();
        await page.locator('.history-close').click();
        await expect(page.locator('.history-sidebar')).toBeHidden();
    });
});
