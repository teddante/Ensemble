import { test as base, expect, Page, Route } from '@playwright/test';

/**
 * SSE Event types matching StreamEvent from the app
 */
interface SSEEvent {
    type: 'model_start' | 'model_chunk' | 'model_complete' | 'model_error' |
    'synthesis_start' | 'synthesis_chunk' | 'synthesis_complete' | 'error' | 'complete';
    modelId?: string;
    content?: string;
    error?: string;
    tokens?: number;
}

/**
 * Helper to create SSE formatted data
 */
export function formatSSE(event: SSEEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Mock SSE response generator for /api/generate
 */
export function createMockGenerateResponse(options: {
    models: string[];
    prompt: string;
    includeError?: string; // Model ID that should error
}): string {
    const { models, includeError } = options;
    let response = '';

    // Generate responses for each model
    for (const modelId of models) {
        response += formatSSE({ type: 'model_start', modelId });

        if (modelId === includeError) {
            response += formatSSE({
                type: 'model_error',
                modelId,
                error: 'Simulated model error for testing'
            });
            continue;
        }

        // Simulate streaming chunks
        const chunks = [`Response from ${modelId}: `, 'This is ', 'a test ', 'response.'];
        for (const chunk of chunks) {
            response += formatSSE({ type: 'model_chunk', modelId, content: chunk });
        }

        const fullContent = chunks.join('');
        response += formatSSE({
            type: 'model_complete',
            modelId,
            content: fullContent,
            tokens: 30
        });
    }

    // Synthesis
    response += formatSSE({ type: 'synthesis_start' });
    const synthesisChunks = ['## Synthesized Response\n\n', 'Based on the ', 'model outputs, ', 'here is the synthesis.'];
    for (const chunk of synthesisChunks) {
        response += formatSSE({ type: 'synthesis_chunk', content: chunk });
    }
    response += formatSSE({
        type: 'synthesis_complete',
        content: synthesisChunks.join('')
    });

    // Complete
    response += formatSSE({ type: 'complete' });

    return response;
}

/**
 * Mock models response - Include DEFAULT_SELECTED_MODELS IDs
 * to ensure settings validation doesn't filter them out
 */
export const MOCK_MODELS = [
    // These match DEFAULT_SELECTED_MODELS to ensure they're pre-selected
    {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'Anthropic',
        contextWindow: 200000,
        pricing: { prompt: 0.003, completion: 0.015 },
        description: 'Most intelligent Claude model'
    },
    {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        contextWindow: 128000,
        pricing: { prompt: 0.005, completion: 0.015 },
        description: 'OpenAI flagship multimodal model'
    },
    {
        id: 'google/gemini-2.0-flash-exp:free',
        name: 'Gemini 2.0 Flash',
        provider: 'Google',
        contextWindow: 32768,
        pricing: { prompt: 0.0, completion: 0.0 },
        description: 'Google latest experimental model'
    },
    // Additional models for multi-model tests
    {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        provider: 'OpenAI',
        contextWindow: 8192,
        pricing: { prompt: 0.03, completion: 0.06 },
        description: 'OpenAI GPT-4'
    },
    {
        id: 'anthropic/claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'Anthropic',
        contextWindow: 200000,
        pricing: { prompt: 0.015, completion: 0.075 },
        description: 'Claude 3 Opus'
    }
];

/**
 * Extended test fixture with common utilities
 */
export const test = base.extend<{
    mockApi: {
        mockModels: () => Promise<void>;
        mockGenerate: (options?: { includeError?: string }) => Promise<void>;
        mockApiKey: (options: { hasKey: boolean; allowDelete?: boolean }) => Promise<void>;
        mockApiKeyExists: () => Promise<void>;
        mockApiKeyNotExists: () => Promise<void>;
        setupAllMocks: () => Promise<void>;
    };
}>({
    mockApi: async ({ page }, use) => {
        const mockApi = {
            /**
             * Mock the /api/models endpoint to return test models
             */
            async mockModels() {
                await page.route('**/api/models', async (route: Route) => {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ models: MOCK_MODELS }),
                    });
                });
            },

            /**
             * Mock the /api/generate endpoint with SSE response
             */
            async mockGenerate(options?: { includeError?: string }) {
                await page.route('**/api/generate', async (route: Route) => {
                    const request = route.request();
                    const body = request.postDataJSON();

                    console.log('[E2E Mock] /api/generate called with models:', body.models);

                    const sseResponse = createMockGenerateResponse({
                        models: body.models || ['openai/gpt-4'],
                        prompt: body.prompt || 'test',
                        includeError: options?.includeError,
                    });

                    console.log('[E2E Mock] SSE response length:', sseResponse.length);

                    await route.fulfill({
                        status: 200,
                        contentType: 'text/event-stream',
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Connection': 'keep-alive',
                        },
                        body: sseResponse,
                    });
                });
            },

            /**
             * Mock /api/key endpoint with configurable key state
             */
            async mockApiKey({ hasKey, allowDelete = false }: { hasKey: boolean; allowDelete?: boolean }) {
                await page.route('**/api/key', async (route: Route) => {
                    const method = route.request().method();

                    if (method === 'GET') {
                        await route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            body: JSON.stringify({ hasKey }),
                        });
                    } else if (method === 'POST') {
                        await route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            body: JSON.stringify({ success: true }),
                        });
                    } else if (method === 'DELETE' && allowDelete) {
                        await route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            body: JSON.stringify({ success: true }),
                        });
                    } else {
                        await route.continue();
                    }
                });
            },

            /**
             * Mock API key exists (user is authenticated)
             */
            async mockApiKeyExists() {
                await mockApi.mockApiKey({ hasKey: true, allowDelete: true });
            },

            /**
             * Mock API key does not exist (show settings modal)
             */
            async mockApiKeyNotExists() {
                await mockApi.mockApiKey({ hasKey: false });
            },

            /**
             * Setup all mocks for a standard authenticated test
             */
            async setupAllMocks() {
                await mockApi.mockModels();
                await mockApi.mockApiKeyExists();
                await mockApi.mockGenerate();
            },
        };

        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use(mockApi);
    },
});

export { expect };

/**
 * Helper: Select a model by name (clicks the model chip button)
 * Uses aria-label for exact matching to avoid 'GPT-4' matching 'GPT-4o'
 */
export async function selectModel(page: Page, modelName: string): Promise<void> {
    // Wait for the model chips to be loaded
    await expect(page.locator('.model-chip').first()).toBeVisible({ timeout: 10000 });

    // Find the button using aria-label which contains the exact model name
    // aria-label format is "Select {modelName}" or "Deselect {modelName}"
    const modelButton = page.locator(`button.model-chip[aria-label$="${modelName}"]`).first();
    await expect(modelButton).toBeVisible({ timeout: 5000 });
    await modelButton.click();
}

/**
 * Helper: Submit a prompt
 */
export async function submitPrompt(page: Page, prompt: string): Promise<void> {
    await page.locator('.prompt-textarea').fill(prompt);
    await page.locator('.submit-button').click();
}

/**
 * Helper: Wait for generation to complete
 */
export async function waitForGeneration(page: Page): Promise<void> {
    // Wait for synthesis content to appear - could be in active generation or history
    // Wait for either the synthesized-response container OR the actual text content
    await Promise.race([
        expect(page.locator('.synthesized-response').first()).toBeVisible({ timeout: 30000 }),
        expect(page.getByText('here is the synthesis')).toBeVisible({ timeout: 30000 }),
    ]);
}

/**
 * Helper: Navigate to page and wait for it to be fully ready
 * Uses a simple and robust approach
 */
export async function navigateAndWaitForReady(page: Page): Promise<void> {
    // Navigate to the page and wait for key API responses
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/api/key') && resp.request().method() === 'GET', { timeout: 15000 }),
        page.waitForResponse(resp => resp.url().includes('/api/models'), { timeout: 15000 }),
        page.goto('/'),
    ]);

    // Wait for the model selector to be visible - this indicates the page is loaded
    await expect(page.locator('.model-selector')).toBeVisible({ timeout: 15000 });

    // Wait a moment for React state to settle
    await page.waitForTimeout(500);

    // Close modal if it's open (race condition handling)
    const modalVisible = await page.locator('.modal-overlay').isVisible();
    if (modalVisible) {
        // Click the close button
        await page.locator('.modal-close').click();
        await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 5000 });
    }

    // Wait for model chips to be rendered
    await expect(page.locator('.model-chip').first()).toBeVisible({ timeout: 10000 });
}

/**
 * Helper: Navigate and wait for the API key check to complete
 * For tests that need to verify the modal behavior
 */
export async function navigateWithKeyCheck(page: Page): Promise<void> {
    // Navigate and wait for key response
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/api/key') && resp.request().method() === 'GET', { timeout: 15000 }),
        page.goto('/'),
    ]);

    // Wait for React hydration and page to stabilize
    await page.waitForLoadState('domcontentloaded');

    // Wait for the page to fully render - the model-selector should be present
    await expect(page.locator('.model-selector')).toBeVisible({ timeout: 15000 });

    // Give React time to process the key check response and update state
    await page.waitForTimeout(500);
}
