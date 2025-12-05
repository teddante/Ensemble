import { NextRequest } from 'next/server';
import { OpenRouter } from '@openrouter/sdk';
import { validatePrompt, validateApiKey, validateModels } from '@/lib/validation';
import { createSynthesisPrompt } from '@/lib/openrouter';
import { StreamEvent } from '@/types';

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

async function streamModelResponse(
    client: OpenRouter,
    model: string,
    prompt: string,
    reasoning: any, // Pass reasoning params
    controller: ReadableStreamDefaultController,
    signal: AbortSignal
): Promise<{ modelId: string; content: string; success: boolean }> {
    let fullContent = '';

    sendEvent(controller, { type: 'model_start', modelId: model });

    try {
        const stream = await client.chat.send(
            {
                model,
                messages: [{ role: 'user', content: prompt }],
                reasoning, // Pass reasoning
                stream: true,
            },
            { signal }
        );

        for await (const chunk of stream) {
            if ('error' in chunk && chunk.error) {
                sendEvent(controller, {
                    type: 'model_error',
                    modelId: model,
                    error: chunk.error.message || 'Unknown error'
                });
                return { modelId: model, content: '', success: false };
            }

            // Handle reasoning - checking both possible locations based on SDK/API version
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reasoningContent = (chunk.choices?.[0]?.delta as any)?.reasoning ||
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (chunk.choices?.[0]?.delta as any)?.reasoning_details?.text ||
                null;

            if (reasoningContent) {
                sendEvent(controller, { type: 'model_reasoning', modelId: model, reasoning: reasoningContent });
            }

            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
                fullContent += content;
                sendEvent(controller, { type: 'model_chunk', modelId: model, content });
            }
        }

        sendEvent(controller, {
            type: 'model_complete',
            modelId: model,
            content: fullContent,
            tokens: fullContent.split(/\s+/).filter(Boolean).length // Word count approximation
        });

        return { modelId: model, content: fullContent, success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        sendEvent(controller, { type: 'model_error', modelId: model, error: errorMessage });
        return { modelId: model, content: '', success: false };
    }
}

export async function POST(request: NextRequest): Promise<Response> {
    try {
        const body = await request.json();
        const { prompt, models, refinementModel, reasoning } = body;

        // Get API key from Authorization header
        const authHeader = request.headers.get('authorization');
        const apiKey = authHeader?.replace('Bearer ', '') || body.apiKey; // Fallback to body for transition

        // Validate inputs
        const promptValidation = validatePrompt(prompt);
        if (!promptValidation.isValid) {
            return Response.json({ error: promptValidation.error }, { status: 400 });
        }

        const apiKeyValidation = validateApiKey(apiKey);
        if (!apiKeyValidation.isValid) {
            return Response.json({ error: apiKeyValidation.error }, { status: 401 });
        }

        const modelsValidation = validateModels(models);
        if (!modelsValidation.isValid) {
            return Response.json({ error: modelsValidation.error }, { status: 400 });
        }

        // Create OpenRouter client
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
                        streamModelResponse(
                            client,
                            model,
                            promptValidation.sanitized!,
                            reasoning,
                            controller,
                            abortController.signal
                        )
                    );

                    const results = await Promise.all(modelPromises);

                    // Filter successful responses for synthesis
                    const successfulResponses = results.filter(r => r.success && r.content);

                    if (successfulResponses.length === 0) {
                        sendEvent(controller, {
                            type: 'error',
                            error: 'All models failed to generate responses'
                        });
                        controller.close();
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
                                    error: `Synthesis failed: ${chunk.error.message}`
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
                        const errorMessage = error instanceof Error ? error.message : 'Synthesis failed';
                        sendEvent(controller, { type: 'error', error: errorMessage });
                    }

                    sendEvent(controller, { type: 'complete' });
                    controller.close();
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    sendEvent(controller, { type: 'error', error: errorMessage });
                    controller.close();
                }
            },
            cancel() {
                abortController.abort();
            },
        });

        return createSSEResponse(stream);
    } catch (error) {
        console.error('Generation error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
