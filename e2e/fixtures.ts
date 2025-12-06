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
    tokens?: {
        prompt: number;
        completion: number;
        total: number;
    };
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
    delayMs?: number; // Delay between chunks
}): string {
    const { models, prompt, includeError, delayMs = 0 } = options;
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
            tokens: { prompt: 10, completion: 20, total: 30 }
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
 * Mock models response
 */
export const MOCK_MODELS = [
    {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        provider: 'OpenAI',
        contextWindow: 8192,
        pricing: { prompt: 0.03, completion: 0.06 },
        description: 'Test model 1'
    },
    {
        id: 'anthropic/claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'Anthropic',
        contextWindow: 200000,
        pricing: { prompt: 0.015, completion: 0.075 },
        description: 'Test model 2'
    },
    {
        id: 'google/gemini-pro',
        name: 'Gemini Pro',
        provider: 'Google',
        contextWindow: 32768,
        pricing: { prompt: 0.00025, completion: 0.0005 },
        description: 'Test model 3'
    }
];

/**
 * Extended test fixture with common utilities
 */
export const test = base.extend<{
    mockApi: {
        mockModels: () => Promise<void>;
        mockGenerate: (options?: { includeError?: string }) => Promise<void>;
        mockApiKeyExists: () => Promise<void>;
        mockApiKeyNotExists: () => Promise<void>;
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
                        body: JSON.stringify(MOCK_MODELS),
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

                    const sseResponse = createMockGenerateResponse({
                        models: body.models || ['openai/gpt-4'],
                        prompt: body.prompt || 'test',
                        includeError: options?.includeError,
                    });

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
             * Mock API key exists (user is authenticated)
             */
            async mockApiKeyExists() {
                await page.route('**/api/key', async (route: Route) => {
                    const method = route.request().method();

                    if (method === 'GET') {
                        await route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            body: JSON.stringify({ hasKey: true }),
                        });
                    } else if (method === 'POST') {
                        await route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            body: JSON.stringify({ success: true }),
                        });
                    } else if (method === 'DELETE') {
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
             * Mock API key does not exist (show settings modal)
             */
            async mockApiKeyNotExists() {
                await page.route('**/api/key', async (route: Route) => {
                    const method = route.request().method();

                    if (method === 'GET') {
                        await route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            body: JSON.stringify({ hasKey: false }),
                        });
                    } else if (method === 'POST') {
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
        };

        await use(mockApi);
    },
});

export { expect };

/**
 * Helper: Select a model by name (clicks the model chip button)
 */
export async function selectModel(page: Page, modelName: string): Promise<void> {
    // Find the button with the model name that is NOT already selected
    const modelButton = page.locator('.model-chip').filter({ hasText: modelName }).first();
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
    // Wait for synthesis to appear and streaming to end
    await expect(page.locator('.synthesized-response')).toBeVisible({ timeout: 30000 });
    // Wait for streaming badge to disappear
    await expect(page.locator('.streaming-badge')).toBeHidden({ timeout: 30000 });
}

/**
 * Helper: Ensure the settings modal is closed (for tests with API key mocked)
 * This handles the race condition where modal may briefly appear before API response
 */
export async function ensureModalClosed(page: Page): Promise<void> {
    // Check if modal is visible
    const isModalVisible = await page.locator('.modal-overlay').isVisible();

    if (isModalVisible) {
        // If modal is visible, close it by clicking the close button
        try {
            await page.locator('.modal-close').click({ timeout: 2000 });
            await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 5000 });
        } catch {
            // Modal might have closed on its own or not be interactable
        }
    }
}
