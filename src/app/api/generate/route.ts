import { NextRequest } from 'next/server';
import { validatePrompt, validateApiKey, validateModels } from '@/lib/validation';
import { createOpenRouterClient, createSynthesisPrompt, streamModelResponse as libStreamModelResponse, validateSynthesisContext } from '@/lib/openrouter';
import { StreamEvent, ReasoningParams, Message } from '@/types';
import { getApiKeyFromCookie } from '@/app/api/key/route';
import { MAX_REQUEST_BODY_SIZE, MAX_SYNTHESIS_CHARS, REQUEST_TIMEOUT_MS } from '@/lib/constants';
import { logger, generateRequestId } from '@/lib/logger';
import { handleOpenRouterError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { acquireLock, releaseLock } from '@/lib/sessionLock';
import { countWords } from '@/lib/textUtils';
import { errorResponse, validateCSRF } from '@/lib/apiSecurity';

export const runtime = 'edge';

interface GenerateRequestBody {
    prompt: string;
    models: string[];
    refinementModel?: string;
    reasoning?: { effort?: ReasoningParams['effort'] };
    modelConfigs?: Record<string, { reasoning?: { enabled?: boolean; effort?: ReasoningParams['effort'] } }>;
    maxSynthesisChars?: number;
    contextWarningThreshold?: number;
    sessionId?: string;
    systemPrompt?: string;
    messages?: Message[];
}

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

function injectTimestamp(
    systemPrompt: string | undefined,
    messages: Message[] | undefined
): { systemPrompt: string; messages: Message[] } {
    const timeContent = `Current Date and Time (UTC): ${new Date().toUTCString()}`;

    const updatedSystemPrompt = systemPrompt
        ? `${systemPrompt}\n${timeContent}`
        : timeContent;

    let updatedMessages: Message[];
    if (!messages) {
        updatedMessages = [{ role: 'system', content: timeContent }];
    } else {
        updatedMessages = [...messages];
        const systemIndex = updatedMessages.findIndex(m => m.role === 'system');
        if (systemIndex >= 0) {
            updatedMessages[systemIndex] = {
                ...updatedMessages[systemIndex],
                content: `${updatedMessages[systemIndex].content}\n${timeContent}`,
            };
        } else {
            updatedMessages.unshift({ role: 'system', content: timeContent });
        }
    }

    return { systemPrompt: updatedSystemPrompt, messages: updatedMessages };
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

    const debugMessages: Message[] = messages && messages.length > 0
        ? messages
        : [{ role: 'user', content: prompt }];

    sendEvent(controller, {
        type: 'debug_prompt',
        modelId: model,
        promptData: { modelId: model, messages: debugMessages }
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
            onComplete: (_content, usage) => {
                finalUsage = usage;
            },
            onError: (error) => {
                throw new Error(error);
            },
            signal
        });

        const wordCount = countWords(fullContent);
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
        if (!validateCSRF(request)) {
            return errorResponse('Invalid request', 403);
        }

        // Check request body size
        const contentLengthHeader = request.headers.get('content-length');
        if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_REQUEST_BODY_SIZE) {
            return errorResponse('Request body too large', 413);
        }

        const rawBody = await request.text();
        const rawBodySize = new TextEncoder().encode(rawBody).byteLength;
        if (rawBodySize > MAX_REQUEST_BODY_SIZE) {
            return errorResponse('Request body too large', 413);
        }

        let body: GenerateRequestBody;
        try {
            body = JSON.parse(rawBody) as GenerateRequestBody;
        } catch {
            return errorResponse('Invalid JSON body', 400);
        }

        const { prompt, models, refinementModel, reasoning: globalReasoning, modelConfigs, maxSynthesisChars, contextWarningThreshold, sessionId } = body;
        const safeRefinementModel = typeof refinementModel === 'string' ? refinementModel : undefined;
        const safeSessionId = typeof sessionId === 'string' ? sessionId : undefined;

        // Inject current date/time into both systemPrompt and messages
        const injected = injectTimestamp(body.systemPrompt, body.messages);
        const systemPrompt = injected.systemPrompt;
        const messages = injected.messages;

        const effectiveMaxSynthesisChars = typeof maxSynthesisChars === 'number' ? maxSynthesisChars : MAX_SYNTHESIS_CHARS;
        const effectiveWarningThreshold = typeof contextWarningThreshold === 'number' ? contextWarningThreshold : 0.8;

        // Get API key from Cookie only (secure storage)
        const apiKey: string | null = await getApiKeyFromCookie();

        if (!apiKey) {
            return errorResponse('API key not configured. Please set your API key in Settings.', 401);
        }

        // Validate inputs
        const promptValidation = validatePrompt(prompt);
        if (!promptValidation.isValid) {
            return errorResponse(promptValidation.error!, 400);
        }

        const apiKeyValidation = validateApiKey(apiKey || '');
        if (!apiKeyValidation.isValid) {
            return errorResponse(apiKeyValidation.error!, 401);
        }

        const modelsValidation = validateModels(models);
        if (!modelsValidation.isValid) {
            return errorResponse(modelsValidation.error!, 400);
        }

        // Rate Limiting (by API Key)
        const rateLimitResult = await checkRateLimit(apiKeyValidation.sanitized!);
        if (!rateLimitResult.success) {
            logger.warn('Rate limit exceeded', { requestId });
            return errorResponse(
                'Rate limit exceeded. Please try again later.',
                429,
                { 'Retry-After': String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)) }
            );
        }

        // Session Locking
        if (safeSessionId) {
            const locked = await acquireLock(safeSessionId);
            if (!locked) {
                logger.warn('Session locked', { requestId, sessionId: safeSessionId });
                return errorResponse('A request is already in progress for this session. Please wait for it to complete.', 409);
            }
        }

        const client = createOpenRouterClient(apiKeyValidation.sanitized!);

        // Create abort controller for cleanup
        const abortController = new AbortController();

        // Create SSE stream
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Fetch responses from all models in parallel
                    const modelPromises = models.map((model: string) => {
                        const config = modelConfigs?.[model]?.reasoning;

                        let shouldReason = false;
                        let effort = undefined;

                        if (config?.enabled) {
                            shouldReason = true;
                            effort = config.effort;
                        } else if (globalReasoning) {
                            shouldReason = true;
                            effort = globalReasoning.effort;
                        }

                        const reasoningParams = shouldReason ? { effort } : undefined;

                        return generateSingleModelResponse(
                            model,
                            promptValidation.sanitized!,
                            messages,
                            apiKeyValidation.sanitized!,
                            reasoningParams,
                            shouldReason,
                            controller,
                            abortController.signal
                        );
                    });

                    const results = await Promise.all(modelPromises);

                    // Filter successful responses for synthesis
                    const successfulResponses = results.filter((r: { success: boolean; content: string }) => r.success && r.content);

                    if (successfulResponses.length === 0) {
                        sendEvent(controller, { type: 'error', error: 'All models failed to generate responses' });
                        return;
                    }

                    // Synthesize responses
                    const synthesisModel = safeRefinementModel || models[0];
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
                            sendEvent(controller, { type: 'warning', warning: contextValidation.warning });
                        }

                        const synthesisPrompt = createSynthesisPrompt(
                            promptValidation.sanitized!,
                            successfulResponses,
                            effectiveMaxSynthesisChars
                        );

                        // Create timeout signal for synthesis
                        const synthesisSignal = AbortSignal.any([
                            abortController.signal,
                            AbortSignal.timeout(REQUEST_TIMEOUT_MS)
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
                            promptData: { modelId: synthesisModel, messages: synthesisMessages }
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

                        sendEvent(controller, { type: 'synthesis_complete', content: synthesizedContent });
                    } catch (error) {
                        sendEvent(controller, { type: 'error', error: handleOpenRouterError(error) });
                    }

                    sendEvent(controller, { type: 'complete' });
                } catch (error) {
                    sendEvent(controller, { type: 'error', error: handleOpenRouterError(error) });
                } finally {
                    if (safeSessionId) {
                        await releaseLock(safeSessionId);
                    }
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
        return errorResponse(handleOpenRouterError(error), 500);
    }
}
