import { test, expect, navigateAndWaitForReady, navigateWithKeyCheck } from './fixtures';

test.describe('API Key Management', () => {
    test('should show settings modal on first load without API key', async ({ page, mockApi }) => {
        await mockApi.mockModels();
        await mockApi.mockApiKeyNotExists();
        await navigateWithKeyCheck(page);

        await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.api-key-input')).toBeVisible();
    });

    test('should save API key and close modal', async ({ page, mockApi }) => {
        await mockApi.mockModels();
        let apiKeyPosted = false;
        await page.route('**/api/key', async (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasKey: apiKeyPosted }) });
            } else if (method === 'POST') {
                apiKeyPosted = true;
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
            } else {
                await route.continue();
            }
        });

        await navigateWithKeyCheck(page);
        await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
        await page.locator('.api-key-input').fill('sk-or-v1-test1234567890abcdef');
        await page.locator('.button-primary').click();
        await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 5000 });
    });

    test('should show error for invalid API key format', async ({ page, mockApi }) => {
        await mockApi.mockModels();
        await page.route('**/api/key', async (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasKey: false }) });
            } else if (method === 'POST') {
                await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid API key format' }) });
            }
        });

        await navigateWithKeyCheck(page);
        await page.locator('.api-key-input').fill('invalid-key');
        await page.locator('.button-primary').click();
        await expect(page.locator('.form-error')).toBeVisible({ timeout: 5000 });
    });

    test('should open settings modal when clicking settings button', async ({ page, mockApi }) => {
        await mockApi.setupAllMocks();
        await navigateAndWaitForReady(page);

        await expect(page.locator('.modal-overlay')).toBeHidden();
        await page.locator('button[aria-label="Open settings"]').click();
        await expect(page.locator('.modal-overlay')).toBeVisible();
    });

    test('should close settings modal with close button', async ({ page, mockApi }) => {
        await mockApi.mockModels();
        await mockApi.mockApiKeyNotExists();
        await navigateWithKeyCheck(page);

        await expect(page.locator('.modal-overlay')).toBeVisible();
        await page.locator('.modal-close').click();
        await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 5000 });
    });

    test('should show warning when no API key configured', async ({ page, mockApi }) => {
        await mockApi.mockModels();
        await mockApi.mockApiKeyNotExists();
        await navigateWithKeyCheck(page);

        await page.locator('.modal-close').click();
        await expect(page.locator('.modal-overlay')).toBeHidden();
        await expect(page.getByText(/Please configure your OpenRouter API key/)).toBeVisible();
    });
});
