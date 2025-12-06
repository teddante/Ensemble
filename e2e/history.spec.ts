import { test, expect, selectModel, submitPrompt, waitForGeneration, ensureModalClosed } from './fixtures';

test.describe('History Save/Load', () => {
    test.beforeEach(async ({ page, mockApi }) => {
        // Clear localStorage before each test
        await page.addInitScript(() => {
            window.localStorage.clear();
        });

        // Set up all mocks BEFORE navigation
        await mockApi.mockModels();
        await mockApi.mockApiKeyExists();
        await mockApi.mockGenerate();

        // Navigate to the page
        await page.goto('/');

        // Wait for page to stabilize
        await page.waitForLoadState('networkidle');

        // Ensure modal is closed
        await ensureModalClosed(page);
    });

    test('should save generation to history after completion', async ({ page }) => {
        // Generate a response
        await selectModel(page, 'GPT-4');
        await submitPrompt(page, 'History test prompt');

        // Wait for generation to complete
        await waitForGeneration(page);

        // Open history sidebar (button with aria-label)
        await page.locator('button[aria-label="Open history"]').click();

        // Verify history sidebar is open
        await expect(page.locator('.history-sidebar')).toBeVisible();

        // Verify the history item exists
        await expect(page.locator('.history-sidebar').getByText('History test prompt')).toBeVisible();
    });

    test('should load history item when clicked', async ({ page }) => {
        // Pre-populate localStorage with a history item - use evaluate to set after navigation
        await page.evaluate(() => {
            const historyItem = {
                id: 'test-id-1',
                timestamp: Date.now(),
                prompt: 'Previous prompt',
                models: ['openai/gpt-4'],
                refinementModel: 'openai/gpt-4',
                responses: [{
                    modelId: 'openai/gpt-4',
                    content: 'Previous response content',
                    status: 'complete'
                }],
                synthesizedContent: 'Previous synthesis content'
            };
            window.localStorage.setItem('ensemble_history', JSON.stringify([historyItem]));
        });

        // Reload to pick up the history
        await page.reload();
        await page.waitForLoadState('networkidle');
        await ensureModalClosed(page);

        // Open history sidebar
        await page.locator('button[aria-label="Open history"]').click();
        await expect(page.locator('.history-sidebar')).toBeVisible();

        // Click the history item content to load it
        await page.locator('.history-item-content').filter({ hasText: 'Previous prompt' }).click();

        // Verify prompt is restored
        await expect(page.locator('.prompt-textarea')).toHaveValue('Previous prompt');

        // Verify synthesis content is restored
        await expect(page.getByText('Previous synthesis content')).toBeVisible();
    });

    test('should delete single history item', async ({ page }) => {
        // Pre-populate with history items
        await page.evaluate(() => {
            const historyItems = [
                {
                    id: 'test-id-1',
                    timestamp: Date.now(),
                    prompt: 'First prompt',
                    models: ['openai/gpt-4'],
                    refinementModel: 'openai/gpt-4',
                    responses: [],
                    synthesizedContent: 'First synthesis'
                },
                {
                    id: 'test-id-2',
                    timestamp: Date.now() - 1000,
                    prompt: 'Second prompt',
                    models: ['openai/gpt-4'],
                    refinementModel: 'openai/gpt-4',
                    responses: [],
                    synthesizedContent: 'Second synthesis'
                }
            ];
            window.localStorage.setItem('ensemble_history', JSON.stringify(historyItems));
        });

        // Reload to pick up the history
        await page.reload();
        await page.waitForLoadState('networkidle');
        await ensureModalClosed(page);

        // Open history sidebar
        await page.locator('button[aria-label="Open history"]').click();
        await expect(page.locator('.history-sidebar')).toBeVisible();

        // Verify both items exist
        await expect(page.locator('.history-sidebar').getByText('First prompt')).toBeVisible();
        await expect(page.locator('.history-sidebar').getByText('Second prompt')).toBeVisible();

        // Delete the first item (delete button with history-delete class)
        const firstItem = page.locator('.history-item').filter({ hasText: 'First prompt' });
        const deleteButton = firstItem.locator('.history-delete');
        await deleteButton.click();

        // Confirm deletion in the confirm modal (has role="alertdialog")
        await expect(page.locator('[role="alertdialog"]')).toBeVisible();
        await page.locator('[role="alertdialog"]').getByRole('button', { name: /delete/i }).click();

        // First item should be gone, second should remain
        await expect(page.locator('.history-sidebar').getByText('First prompt')).toBeHidden();
        await expect(page.locator('.history-sidebar').getByText('Second prompt')).toBeVisible();
    });

    test('should clear all history', async ({ page }) => {
        // Pre-populate with history items
        await page.evaluate(() => {
            const historyItems = [
                {
                    id: 'test-id-1',
                    timestamp: Date.now(),
                    prompt: 'First prompt',
                    models: ['openai/gpt-4'],
                    refinementModel: 'openai/gpt-4',
                    responses: [],
                    synthesizedContent: 'First synthesis'
                },
                {
                    id: 'test-id-2',
                    timestamp: Date.now() - 1000,
                    prompt: 'Second prompt',
                    models: ['openai/gpt-4'],
                    refinementModel: 'openai/gpt-4',
                    responses: [],
                    synthesizedContent: 'Second synthesis'
                }
            ];
            window.localStorage.setItem('ensemble_history', JSON.stringify(historyItems));
        });

        // Reload to pick up the history
        await page.reload();
        await page.waitForLoadState('networkidle');
        await ensureModalClosed(page);

        // Open history sidebar
        await page.locator('button[aria-label="Open history"]').click();
        await expect(page.locator('.history-sidebar')).toBeVisible();

        // Click "Clear All History" button
        await page.locator('.history-clear').click();

        // Confirm in the modal (has role="alertdialog")
        await expect(page.locator('[role="alertdialog"]')).toBeVisible();
        await page.locator('[role="alertdialog"]').getByRole('button', { name: /clear all/i }).click();

        // All items should be gone - should show empty state
        await expect(page.locator('.history-empty')).toBeVisible();
    });

    test('should persist history across page reload', async ({ page }) => {
        // Generate a response
        await selectModel(page, 'GPT-4');
        await submitPrompt(page, 'Persistence test');

        // Wait for completion
        await waitForGeneration(page);

        // Reload page
        await page.reload();

        // Wait for page to load
        await page.waitForLoadState('networkidle');
        await ensureModalClosed(page);

        // Open history sidebar
        await page.locator('button[aria-label="Open history"]').click();

        // History should still contain the item
        await expect(page.locator('.history-sidebar').getByText('Persistence test')).toBeVisible();
    });

    test('should close history sidebar when clicking close button', async ({ page }) => {
        // Open history sidebar
        await page.locator('button[aria-label="Open history"]').click();
        await expect(page.locator('.history-sidebar')).toBeVisible();

        // Close sidebar (history-close button)
        await page.locator('.history-close').click();

        // Sidebar should be hidden (it returns null when closed)
        await expect(page.locator('.history-sidebar')).toBeHidden();
    });
});
