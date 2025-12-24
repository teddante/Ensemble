import { NextRequest } from 'next/server';
import { OpenRouter } from '@openrouter/sdk';
import { validatePrompt, validateApiKey, validateModels } from '@/lib/validation';
import { MAX_SYNTHESIS_CHARS, createSynthesisPrompt, streamModelResponse as libStreamModelResponse, validateSynthesisContext } from '@/lib/openrouter';
import { StreamEvent, ReasoningParams, Message } from '@/types';
import { getApiKeyFromCookie } from '@/app/api/key/route';
import { MAX_REQUEST_BODY_SIZE, REQUEST_TIMEOUT_MS } from '@/lib/constants';
import { logger, generateRequestId } from '@/lib/logger';
import { handleOpenRouterError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { acquireLock, releaseLock } from '@/lib/sessionLock';

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
    messages: Message[] | undefined,
    apiKey: string,
    reasoning: ReasoningParams | undefined,
    includeReasoning: boolean | undefined,
    controller: ReadableStreamDefaultController,
    signal: AbortSignal
): Promise<{ modelId: string; content: string; success: boolean; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    let fullContent = '';
    let finalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

    // Prepare messages for debug event (mimic what happens in valid streamModelResponse)
    const debugMessages: Message[] = messages && messages.length > 0
        ? messages
        : [{ role: 'user', content: prompt }];

    // Send debug event with the prompt data
    sendEvent(controller, {
        type: 'debug_prompt',
        modelId: model,
        promptData: {
            modelId: model,
            messages: debugMessages
        }
    });

    sendEvent(controller, { type: 'model_start', modelId: model });

    try {
        await libStreamModelResponse({
            prompt,
            messages,
            model,
            apiKey,
            reasoning,
            includeReasoning,
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

        const wordCount = fullContent.split(/\s+/).filter(Boolean).length;
        sendEvent(controller, {
            type: 'model_complete',
            modelId: model,
            content: fullContent,
            tokens: finalUsage?.total_tokens,
            wordCount
        });

        return { modelId: model, content: fullContent, success: true, usage: finalUsage };
    } catch (error) {
        const errorMessage = handleOpenRouterError(error);
        sendEvent(controller, { type: 'model_error', modelId: model, error: errorMessage });
        return { modelId: model, content: '', success: false };
    }
}

export async function POST(request: NextRequest): Promise<Response> {
    const requestId = generateRequestId();

    logger.info('Generation request started', { requestId });

    try {
        // Check request body size (legitimate server protection)
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_BODY_SIZE) {
            return Response.json(
                { error: 'Request body too large' },
                { status: 413 }
            );
        }

        const body = await request.json();
        const { prompt, models, refinementModel, reasoning: globalReasoning, modelConfigs, maxSynthesisChars, contextWarningThreshold, sessionId } = body;
        let { messages, systemPrompt } = body;

        // Inject Current Date and Time
        const currentDate = new Date().toUTCString();
        const timeContext = `\nCurrent Date and Time (UTC): ${currentDate}`;

        // 1. Update systemPrompt for synthesis
        if (systemPrompt) {
            systemPrompt += timeContext;
        } else {
            systemPrompt = `Current Date and Time (UTC): ${currentDate}`;
        }

        // 2. Update messages for individual models
        if (!messages) {
            messages = [{ role: 'system', content: `Current Date and Time (UTC): ${currentDate}` }];
        } else {
            const systemIndex = messages.findIndex((m: Message) => m.role === 'system');
            if (systemIndex >= 0) {
                messages[systemIndex].content += timeContext;
            } else {
                messages.unshift({ role: 'system', content: `Current Date and Time (UTC): ${currentDate}` });
            }
        }

        // Defaults if not provided (should be provided by frontend but good for safety)
        const effectiveMaxSynthesisChars = maxSynthesisChars || MAX_SYNTHESIS_CHARS;
        const effectiveWarningThreshold = contextWarningThreshold || 0.8;

        // Get API key from Cookie only (secure storage)
        const apiKey: string | null = await getApiKeyFromCookie();

        if (!apiKey) {
            return Response.json(
                { error: 'API key not configured. Please set your API key in Settings.' },
                { status: 401 }
            );
        }

        // Validate inputs
        const promptValidation = validatePrompt(prompt);
        if (!promptValidation.isValid) {
            return Response.json({ error: promptValidation.error }, { status: 400 });
        }

        const apiKeyValidation = validateApiKey(apiKey || '');
        if (!apiKeyValidation.isValid) {
            return Response.json({ error: apiKeyValidation.error }, { status: 401 });
        }

        const modelsValidation = validateModels(models);
        if (!modelsValidation.isValid) {
            return Response.json({ error: modelsValidation.error }, { status: 400 });
        }

        // 3. Rate Limiting (by API Key)
        // We use the apiKey as the identifier since it's unique per user (usually)
        // If we wanted to limit by IP, we'd need to trust headers or use a different method
        const rateLimitResult = await checkRateLimit(apiKeyValidation.sanitized!);
        if (!rateLimitResult.success) {
            logger.warn('Rate limit exceeded', { requestId, apiKey: apiKeyValidation.sanitized!.substring(0, 10) + '...' });
            return Response.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)) } }
            );
        }

        // 4. Session Locking
        if (sessionId) {
            const locked = await acquireLock(sessionId);
            if (!locked) {
                logger.warn('Session locked', { requestId, sessionId });
                return Response.json(
                    { error: 'A request is already in progress for this session. Please wait for it to complete.' },
                    { status: 409 }
                );
            }
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
                    const modelPromises = models.map((model: string) => {
                        // Resolve reasoning config for this model
                        // Priority: model-specific config > global reasoning param (legacy)
                        // Note: modelConfigs key might be model ID
                        const config = modelConfigs?.[model]?.reasoning;

                        let shouldReason = false;
                        let effort = undefined;

                        if (config?.enabled) {
                            shouldReason = true;
                            effort = config.effort;
                        } else if (globalReasoning) {
                            // Fallback to legacy global param if provided (though frontend should use modelConfigs now)
                            shouldReason = true;
                            effort = globalReasoning.effort;
                        }

                        // Some models are thinking models by default (:thinking suffix)
                        // For these, we might want to default includeReasoning to true if not explicitly disabled?
                        // But for now let's stick to explicit configuration or "Enable Reasoning" toggle.
                        // Actually, if it is a thinking model, we probably want to see the reasoning.
                        // But let's rely on the config passed from UI which does the logic of "forced" or default.

                        const reasoningParams = shouldReason ? { effort } : undefined;

                        return generateSingleModelResponse(
                            model,
                            promptValidation.sanitized!,
                            messages,
                            apiKeyValidation.sanitized!,
                            reasoningParams,
                            shouldReason, // includeReasoning
                            controller,
                            abortController.signal
                        );
                    });

                    const results = await Promise.all(modelPromises);

                    // Filter successful responses for synthesis
                    const successfulResponses = results.filter((r: { success: boolean; content: string }) => r.success && r.content);

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
                        const contextValidation = validateSynthesisContext(
                            successfulResponses,
                            promptValidation.sanitized!,
                            32000,
                            effectiveMaxSynthesisChars,
                            effectiveWarningThreshold
                        );

                        if (contextValidation.warning) {
                            logger.warn('Synthesis context warning', {
                                requestId,
                                warning: contextValidation.warning,
                                estimatedTokens: contextValidation.estimatedTokens
                            });
                            sendEvent(controller, {
                                type: 'warning',
                                warning: contextValidation.warning
                            });
                        }

                        const synthesisPrompt = createSynthesisPrompt(
                            promptValidation.sanitized!,
                            successfulResponses,
                            effectiveMaxSynthesisChars
                        );

                        // Create timeout signal for synthesis
                        const synthesisTimeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
                        const synthesisSignal = AbortSignal.any([
                            abortController.signal,
                            synthesisTimeoutSignal
                        ]);

                        const synthesisMessages: Message[] = [];
                        if (systemPrompt) {
                            synthesisMessages.push({ role: 'system', content: systemPrompt });
                        }
                        synthesisMessages.push({ role: 'user', content: synthesisPrompt });

                        // Send debug event for synthesis
                        sendEvent(controller, {
                            type: 'debug_prompt',
                            modelId: synthesisModel,
                            promptData: {
                                modelId: synthesisModel,
                                messages: synthesisMessages
                            }
                        });

                        let synthesizedContent = '';
                        const synthesisStream = await client.chat.send(
                            {
                                model: synthesisModel,
                                messages: synthesisMessages,
                                stream: true,
                            },
                            { signal: synthesisSignal }
                        );

                        for await (const chunk of synthesisStream) {
                            if ('error' in chunk && chunk.error) {
                                sendEvent(controller, {
                                    type: 'error',
                                    error: `Synthesis failed: ${handleOpenRouterError(new Error(chunk.error.message))}`
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
                        const errorMessage = handleOpenRouterError(error);
                        sendEvent(controller, { type: 'error', error: errorMessage });
                    }

                    sendEvent(controller, { type: 'complete' });

                    // Release session lock on success
                    if (sessionId) {
                        await releaseLock(sessionId);
                    }

                    controller.close();
                } catch (error) {
                    const errorMessage = handleOpenRouterError(error);
                    sendEvent(controller, { type: 'error', error: errorMessage });

                    // Release session lock on error
                    if (sessionId) {
                        await releaseLock(sessionId);
                    }

                    controller.close();
                }
            },
            async cancel() {
                abortController.abort();
                // Release session lock on cancel
                if (sessionId) {
                    await releaseLock(sessionId);
                }
            },
        });

        return createSSEResponse(stream);
    } catch (error) {
        console.error('Generation error:', error);
        return Response.json(
            { error: handleOpenRouterError(error) },
            { status: 500 }
        );
    }
}
