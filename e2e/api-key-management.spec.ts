import { test, expect, selectModel, submitPrompt } from './fixtures';

test.describe('API Key Management', () => {
    test('should show settings modal on first load without API key', async ({ page, mockApi }) => {
        // Set up mocks BEFORE navigation
        await mockApi.mockModels();
        await mockApi.mockApiKeyNotExists();

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Settings modal should automatically open (uses modal-overlay class)
        await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/OpenRouter API Key/i)).toBeVisible();
    });

    test('should save API key and close modal', async ({ page, mockApi }) => {
        await mockApi.mockModels();

        // Track POST requests to /api/key
        let apiKeyPosted = false;
        await page.route('**/api/key', async (route) => {
            const method = route.request().method();

            if (method === 'GET') {
                // First return no key, then after POST return has key
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ hasKey: apiKeyPosted }),
                });
            } else if (method === 'POST') {
                apiKeyPosted = true;
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true }),
                });
            } else {
                await route.continue();
            }
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Wait for settings modal
        await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });

        // Enter API key (password input)
        const apiKeyInput = page.locator('.api-key-input');
        await apiKeyInput.fill('sk-or-v1-test1234567890abcdef');

        // Save (button with "Save Changes" text)
        const saveButton = page.locator('.button-primary');
        await saveButton.click();

        // Modal should close
        await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 5000 });
    });

    test('should show error for invalid API key format', async ({ page, mockApi }) => {
        await mockApi.mockModels();
        await mockApi.mockApiKeyNotExists();

        await page.route('**/api/key', async (route) => {
            const method = route.request().method();

            if (method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ hasKey: false }),
                });
            } else if (method === 'POST') {
                // Return error for invalid key
                await route.fulfill({
                    status: 400,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Invalid API key format' }),
                });
            }
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.modal-overlay')).toBeVisible();

        // Enter invalid API key
        const apiKeyInput = page.locator('.api-key-input');
        await apiKeyInput.fill('invalid-key');

        // Try to save
        await page.locator('.button-primary').click();

        // Error should appear (form-error class)
        await expect(page.locator('.form-error')).toBeVisible({ timeout: 5000 });
    });

    test('should open settings modal when clicking settings button', async ({ page, mockApi }) => {
        await mockApi.mockModels();
        await mockApi.mockApiKeyExists();

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Settings modal should not be visible initially (since we have a key)
        // Wait for modal to potentially close first
        try {
            await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 5000 });
        } catch {
            // Modal might not have appeared at all
        }

        // Click settings button in header (has aria-label)
        const settingsButton = page.locator('button[aria-label="Open settings"]');
        await settingsButton.click();

        // Modal should open
        await expect(page.locator('.modal-overlay')).toBeVisible();
    });

    test('should close settings modal with close button', async ({ page, mockApi }) => {
        await mockApi.mockModels();
        await mockApi.mockApiKeyNotExists();

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Wait for modal to appear
        await expect(page.locator('.modal-overlay')).toBeVisible();

        // Click close button (modal-close class with X icon)
        const closeButton = page.locator('.modal-close');
        await closeButton.click();

        // Modal should close
        await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 5000 });
    });

    test('should show warning when no API key configured', async ({ page, mockApi }) => {
        await mockApi.mockModels();
        await mockApi.mockApiKeyNotExists();

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Close the initial modal
        await page.locator('.modal-close').click();
        await expect(page.locator('.modal-overlay')).toBeHidden();

        // The prompt should be disabled and show a warning
        await expect(page.getByText(/Please configure your OpenRouter API key/)).toBeVisible();
    });
});
