import { NextRequest } from 'next/server';
import { OpenRouter } from '@openrouter/sdk';
import { validatePrompt, validateApiKey, validateModels } from '@/lib/validation';
import { createSynthesisPrompt, streamModelResponse as libStreamModelResponse } from '@/lib/openrouter';
import { StreamEvent, ReasoningParams } from '@/types';
import { generateRateLimiter, getClientIdentifier } from '@/lib/rateLimit';
import { generationLock, getSessionIdentifier } from '@/lib/sessionLock';
import { getApiKeyFromCookie } from '@/app/api/key/route';

export const runtime = 'edge';

function createSSEResponse(stream: ReadableStream): Response {
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}

function sendEvent(controller: ReadableStreamDefaultController, event: StreamEvent): void {
    const data = JSON.stringify(event);
    controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
}

// Sanitize error messages for production
function sanitizeError(error: unknown): string {
    if (process.env.NODE_ENV === 'development') {
        return error instanceof Error ? error.message : 'Unknown error';
    }

    // In production, only return safe error messages
    if (error instanceof Error) {
        const safeMessages = [
            'Request cancelled',
            'API key is required',
            'Invalid API key',
            'Rate limit exceeded',
            'Model not available',
        ];

        for (const safe of safeMessages) {
            if (error.message.includes(safe)) {
                return error.message;
            }
        }
    }

    return 'An error occurred while processing your request';
}

async function generateSingleModelResponse(
    model: string,
    prompt: string,
    apiKey: string,
    reasoning: ReasoningParams | undefined,
    controller: ReadableStreamDefaultController,
    signal: AbortSignal
): Promise<{ modelId: string; content: string; success: boolean; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    let fullContent = '';
    let finalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

    sendEvent(controller, { type: 'model_start', modelId: model });

    try {
        await libStreamModelResponse({
            prompt,
            model,
            apiKey,
            reasoning,
            onChunk: (content) => {
                fullContent += content;
                sendEvent(controller, { type: 'model_chunk', modelId: model, content });
            },
            onReasoning: (text) => {
                sendEvent(controller, { type: 'model_reasoning', modelId: model, reasoning: text });
            },
            onComplete: (content, usage) => {
                finalUsage = usage;
            },
            onError: (error) => {
                throw new Error(error);
            },
            signal
        });

        sendEvent(controller, {
            type: 'model_complete',
            modelId: model,
            content: fullContent,
            tokens: finalUsage?.total_tokens || fullContent.split(/\s+/).filter(Boolean).length
        });

        return { modelId: model, content: fullContent, success: true, usage: finalUsage };
    } catch (error) {
        const errorMessage = sanitizeError(error);
        sendEvent(controller, { type: 'model_error', modelId: model, error: errorMessage });
        return { modelId: model, content: '', success: false };
    }
}

export async function POST(request: NextRequest): Promise<Response> {
    const sessionId = getSessionIdentifier(request);

    try {
        // Rate limiting
        const clientId = getClientIdentifier(request);
        const rateLimit = await generateRateLimiter.check(clientId);

        if (!rateLimit.success) {
            return Response.json(
                { error: 'Too many requests. Please wait before trying again.' },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.retryAfter || 60) }
                }
            );
        }

        // Session lock - prevent concurrent generation for same session
        if (!generationLock.acquire(sessionId)) {
            return Response.json(
                { error: 'A generation is already in progress. Please wait for it to complete.' },
                { status: 409 }
            );
        }

        const body = await request.json();
        const { prompt, models, refinementModel, reasoning } = body;

        // Get API key from Cookie (primary, decrypted) or Header/Body (fallback)
        let apiKey: string | null = await getApiKeyFromCookie();

        if (!apiKey) {
            // Fallback to header/body for backwards compatibility
            apiKey = request.headers.get('authorization')?.replace('Bearer ', '') ||
                body.apiKey || null;
        }

        // Validate inputs
        const promptValidation = validatePrompt(prompt);
        if (!promptValidation.isValid) {
            generationLock.release(sessionId);
            return Response.json({ error: promptValidation.error }, { status: 400 });
        }

        const apiKeyValidation = validateApiKey(apiKey || '');
        if (!apiKeyValidation.isValid) {
            generationLock.release(sessionId);
            return Response.json({ error: apiKeyValidation.error }, { status: 401 });
        }

        const modelsValidation = validateModels(models);
        if (!modelsValidation.isValid) {
            generationLock.release(sessionId);
            return Response.json({ error: modelsValidation.error }, { status: 400 });
        }

        // Get referer from request or use default
        const referer = request.headers.get('referer') ||
            request.headers.get('origin') ||
            process.env.NEXT_PUBLIC_APP_URL ||
            'https://ensemble.app';

        const client = new OpenRouter({
            apiKey: apiKeyValidation.sanitized!,
            httpReferer: referer,
            xTitle: 'Ensemble Multi-LLM',
        });

        // Create abort controller for cleanup
        const abortController = new AbortController();

        // Create SSE stream
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Fetch responses from all models in parallel
                    const modelPromises = models.map((model: string) =>
                        generateSingleModelResponse(
                            model,
                            promptValidation.sanitized!,
                            apiKeyValidation.sanitized!,
                            reasoning,
                            controller,
                            abortController.signal
                        )
                    );

                    const results = await Promise.all(modelPromises);

                    // Filter successful responses for synthesis
                    const successfulResponses = results.filter((r: { success: boolean; content: string }) => r.success && r.content);

                    if (successfulResponses.length === 0) {
                        sendEvent(controller, {
                            type: 'error',
                            error: 'All models failed to generate responses'
                        });
                        controller.close();
                        generationLock.release(sessionId);
                        return;
                    }

                    // Synthesize responses
                    const synthesisModel = refinementModel || models[0];
                    sendEvent(controller, { type: 'synthesis_start', modelId: synthesisModel });

                    try {
                        const synthesisPrompt = createSynthesisPrompt(
                            promptValidation.sanitized!,
                            successfulResponses
                        );

                        let synthesizedContent = '';
                        const synthesisStream = await client.chat.send(
                            {
                                model: synthesisModel,
                                messages: [{ role: 'user', content: synthesisPrompt }],
                                stream: true,
                            },
                            { signal: abortController.signal }
                        );

                        for await (const chunk of synthesisStream) {
                            if ('error' in chunk && chunk.error) {
                                sendEvent(controller, {
                                    type: 'error',
                                    error: `Synthesis failed: ${sanitizeError(new Error(chunk.error.message))}`
                                });
                                break;
                            }

                            const content = chunk.choices?.[0]?.delta?.content;
                            if (content) {
                                synthesizedContent += content;
                                sendEvent(controller, { type: 'synthesis_chunk', content });
                            }
                        }

                        sendEvent(controller, {
                            type: 'synthesis_complete',
                            content: synthesizedContent
                        });
                    } catch (error) {
                        const errorMessage = sanitizeError(error);
                        sendEvent(controller, { type: 'error', error: errorMessage });
                    }

                    sendEvent(controller, { type: 'complete' });
                    controller.close();
                    generationLock.release(sessionId);
                } catch (error) {
                    const errorMessage = sanitizeError(error);
                    sendEvent(controller, { type: 'error', error: errorMessage });
                    controller.close();
                    generationLock.release(sessionId);
                }
            },
            cancel() {
                abortController.abort();
                generationLock.release(sessionId);
            },
        });

        return createSSEResponse(stream);
    } catch (error) {
        generationLock.release(sessionId);
        console.error('Generation error:', error);
        return Response.json(
            { error: sanitizeError(error) },
            { status: 500 }
        );
    }
}
