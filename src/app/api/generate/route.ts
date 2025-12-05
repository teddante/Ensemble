import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { OpenRouter } from '@openrouter/sdk';
import { validatePrompt, validateApiKey, validateModels } from '@/lib/validation';
import { createSynthesisPrompt, streamModelResponse as libStreamModelResponse } from '@/lib/openrouter';
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

async function generateSingleModelResponse(
    model: string,
    prompt: string,
    apiKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reasoning: any,
    controller: ReadableStreamDefaultController,
    signal: AbortSignal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ modelId: string; content: string; success: boolean; usage?: any }> {
    let fullContent = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalUsage: any;

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
                // fullContent is already accumulated, but we can verify/update if needed. 
                // usage is what we really want here.
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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        sendEvent(controller, { type: 'model_error', modelId: model, error: errorMessage });
        return { modelId: model, content: '', success: false };
    }
}

export async function POST(request: NextRequest): Promise<Response> {
    try {
        const body = await request.json();
        const { prompt, models, refinementModel, reasoning } = body;

        // Get API key from Cookie (primary) or Header/Body (fallback)
        const cookieStore = await cookies();
        const apiKey = cookieStore.get('ensemble_api_key')?.value ||
            request.headers.get('authorization')?.replace('Bearer ', '') ||
            body.apiKey;

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

        // We use this client for synthesis only now
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

                        // Note: For synthesis we are still using direct client.chat.send 
                        // because we might want different handling or just keep it simple.
                        // Ideally checking if synthesis model supports reasoning would be good too,
                        // but sticking to standard behavior for now.
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
