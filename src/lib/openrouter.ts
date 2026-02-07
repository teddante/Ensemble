// OpenRouter API client using the official SDK
import { OpenRouter } from '@openrouter/sdk';
import type { Message as SDKMessage } from '@openrouter/sdk/models/message';
import type { Reasoning } from '@openrouter/sdk/models/chatgenerationparams';
import { ReasoningParams, Message } from '@/types';
import { OpenRouterUsage } from '@/types/openrouter.types';
import { MAX_SYNTHESIS_CHARS, MAX_RETRIES, REQUEST_TIMEOUT_MS, ACTIVITY_TIMEOUT_MS } from '@/lib/constants';
import { exponentialBackoff } from '@/lib/retry';
import { isRetryableError } from '@/lib/errorClassifier';
import { countWords } from '@/lib/textUtils';
import { isReasoningUnsupportedError } from '@/lib/reasoning';
import { logger } from '@/lib/logger';

export function createOpenRouterClient(apiKey: string): OpenRouter {
    return new OpenRouter({
        apiKey,
        httpReferer: 'https://ensemble.app',
        xTitle: 'Ensemble Multi-LLM',
    });
}

export interface StreamOptions {
    prompt: string;
    messages?: Message[];
    model: string;
    apiKey: string;
    reasoning?: ReasoningParams;
    includeReasoning?: boolean;
    onChunk: (content: string) => void;
    onReasoning?: (content: string) => void;
    onComplete: (fullContent: string, usage?: OpenRouterUsage) => void;
    onError: (error: string) => void;
    signal?: AbortSignal;
}

export async function streamModelResponse({
    prompt,
    messages,
    model,
    apiKey,
    reasoning,
    onChunk,
    onReasoning,
    onComplete,
    onError,
    signal,
}: StreamOptions): Promise<void> {
    const client = createOpenRouterClient(apiKey);

    let lastError: Error | null = null;
    let reasoningForRequest = reasoning;
    let disabledReasoningDueToProvider = false;

    // Prepare messages for chat completion
    const chatMessages = messages && messages.length > 0
        ? messages
        : [{ role: 'user', content: prompt }];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // Check if already aborted by user
        if (signal?.aborted) {
            onError('Request cancelled');
            return;
        }

        // Create fresh AbortController for each attempt (controllers can only abort once)
        const activityController = new AbortController();
        let activityTimer: ReturnType<typeof setTimeout> | null = null;

        const resetActivityTimeout = (timeoutMs: number = ACTIVITY_TIMEOUT_MS) => {
            if (activityTimer) {
                clearTimeout(activityTimer);
            }
            activityTimer = setTimeout(() => {
                activityController.abort(new Error('Activity timeout - no response received'));
            }, timeoutMs);
        };

        const clearActivityTimeout = () => {
            if (activityTimer) {
                clearTimeout(activityTimer);
                activityTimer = null;
            }
        };

        // Combine with user-provided signal if present
        const combinedSignal = signal
            ? AbortSignal.any([signal, activityController.signal])
            : activityController.signal;

        let fullContent = '';
        let finalUsage: OpenRouterUsage | undefined;

        try {
            // Start with initial connection timeout (longer - 120s for first response)
            resetActivityTimeout(REQUEST_TIMEOUT_MS);

            // Targeted casts: our Message/ReasoningParams types are runtime-compatible
            // with the SDK's discriminated unions but lack branded type markers
            const stream = await client.chat.send(
                {
                    model,
                    messages: chatMessages as SDKMessage[],
                    reasoning: reasoningForRequest as Reasoning | undefined,
                    stream: true,
                    streamOptions: { includeUsage: true },
                },
                { signal: combinedSignal }
            );

            // Once streaming starts, switch to shorter activity timeout
            resetActivityTimeout(ACTIVITY_TIMEOUT_MS);

            let retryWithoutReasoning = false;
            for await (const chunk of stream) {
                // Reset activity timeout on each chunk - model is still responding
                resetActivityTimeout(ACTIVITY_TIMEOUT_MS);
                // Check for errors in chunk
                if (chunk.error) {
                    const errorMessage = chunk.error.message || 'Unknown error';

                    if (!disabledReasoningDueToProvider
                        && reasoningForRequest
                        && isReasoningUnsupportedError(errorMessage)) {
                        disabledReasoningDueToProvider = true;
                        reasoningForRequest = undefined;
                        retryWithoutReasoning = true;
                        break;
                    }

                    // Check if this error is retryable
                    if (attempt < MAX_RETRIES && isRetryableError(new Error(errorMessage))) {
                        lastError = new Error(errorMessage);
                        break; // Break inner loop to retry
                    }

                    onError(errorMessage);
                    return;
                }

                // Handle usage if present (usually in the last chunk)
                if (chunk.usage) {
                    finalUsage = {
                        prompt_tokens: chunk.usage.promptTokens,
                        completion_tokens: chunk.usage.completionTokens,
                        total_tokens: chunk.usage.totalTokens,
                    };
                }

                // Handle reasoning/thinking tokens (SDK surfaces this natively on delta)
                const delta = chunk.choices?.[0]?.delta;
                if (delta?.reasoning && onReasoning) {
                    onReasoning(delta.reasoning);
                }

                // Handle content tokens
                if (delta?.content) {
                    fullContent += delta.content;
                    onChunk(delta.content);
                }
            }

            if (retryWithoutReasoning) {
                continue;
            }

            // Stream completed successfully - clear timeout and complete
            clearActivityTimeout();
            if (!lastError || fullContent.length > 0) {
                onComplete(fullContent, finalUsage);
                return;
            }
        } catch (error) {
            clearActivityTimeout();
            logger.error(`Stream error for model ${model}`, { error: String(error) });
            if (error instanceof Error) {
                if (!disabledReasoningDueToProvider
                    && reasoningForRequest
                    && isReasoningUnsupportedError(error.message)) {
                    disabledReasoningDueToProvider = true;
                    reasoningForRequest = undefined;
                    continue;
                }

                // Check if user explicitly cancelled (AbortError from user signal, not our timeout)
                if (error.name === 'AbortError' && signal?.aborted) {
                    onError('Request cancelled');
                    return;
                }

                // Check if this is a retryable error (including timeouts)
                if (attempt < MAX_RETRIES && isRetryableError(error)) {
                    lastError = error;
                    const isTimeout = error.name === 'TimeoutError' ||
                        error.message.includes('timeout') ||
                        error.message.includes('Activity timeout');
                    logger.warn(`Retry attempt ${attempt + 1} for model ${model}: ${isTimeout ? 'timeout' : error.message}`);

                    // Reset the activity controller for the retry
                    // Note: We create a fresh timeout in the next iteration
                    await exponentialBackoff(attempt);
                    continue;
                }

                // Non-retryable error or all retries exhausted
                if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
                    onError('Request timed out after all retry attempts');
                } else {
                    onError(error.message);
                }
                return;
            } else {
                onError('Unknown error occurred');
                return;
            }
        }

        // If we have a retryable error and more attempts, wait and retry
        if (lastError && attempt < MAX_RETRIES) {
            console.warn(`Retry attempt ${attempt + 1} for model ${model}: ${lastError.message}`);
            await exponentialBackoff(attempt);
            lastError = null;
        }
    }

    // All retries exhausted
    onError(lastError?.message || 'Request failed after retries');
}

export function createSynthesisPrompt(
    originalPrompt: string,
    modelResponses: { modelId: string; content: string }[],
    maxSynthesisChars: number = MAX_SYNTHESIS_CHARS
): string {
    const validResponses = modelResponses.filter(r => r.content && !r.content.startsWith('Error:'));

    if (validResponses.length === 0) {
        throw new Error('No valid responses to synthesize');
    }

    let synthesisPrompt = `You are Ensemble AI, a unified, helpful, and intelligent AI assistant.
Your goal is to provide the best possible response to the user's prompt.
You have generated several internal drafts to help you form your answer.

Original User Prompt:
"${originalPrompt}"

Here are your internal drafts:

`;

    validResponses.forEach((response, index) => {
        // Truncate response if it's too long to prevent excessive context usage
        // 8000 chars is roughly 2000 tokens, which is a reasonable contribution per model
        // for a synthesis task without blowing up the context window of the synthesizer.
        let content = response.content;



        if (content.length > maxSynthesisChars) {
            content = content.slice(0, maxSynthesisChars) + '\n\n[...Truncated...]';
        }

        synthesisPrompt += `--- Draft ${index + 1} ---
${content}

`;
    });

    synthesisPrompt += `---

Instructions:
1. Synthesize these drafts into a single, cohesive, high-quality response.
2. Resolve any contradictions by choosing the most accurate information.
3. Speak with a single, authoritative voice as "Ensemble AI".
4. Do NOT mention that you are synthesizing drafts or responses.
5. Do NOT mention "the models", "other AIs", or "internal drafts" in your final output.
6. Simply provide the answer as if it is your own direct knowledge.

Final Response:`;

    return synthesisPrompt;
}

/**
 * Improved token estimation using multiple heuristics
 * More accurate than simple /4 character division
 */
export function estimateTokens(text: string): number {
    if (!text) return 0;

    // Count words (more reliable for English)
    const words = countWords(text);

    // Count characters
    const chars = text.length;

    // Special characters often become their own tokens
    const specialChars = (text.match(/[^\w\s]/g) || []).length;

    // Weighted average of different estimation methods:
    // - Words typically map to 1.3 tokens on average
    // - Characters / 4 is a common heuristic
    // - Special characters often add extra tokens
    const wordEstimate = words * 1.3;
    const charEstimate = chars / 4;
    const specialEstimate = specialChars * 0.5;

    // Use the higher of word or char estimate, plus special chars
    return Math.ceil(Math.max(wordEstimate, charEstimate) + specialEstimate);
}

export interface SynthesisValidationResult {
    isValid: boolean;
    estimatedTokens: number;
    maxTokens: number;
    warning?: string;
}

/**
 * Validates that the synthesis prompt will fit within the model's context window
 * @param responses - The model responses to be synthesized
 * @param originalPrompt - The original user prompt
 * @param synthesisModelContextLimit - Context window limit of the synthesis model (default 32k)
 * @returns Validation result with token estimates
 */
export function validateSynthesisContext(
    responses: { modelId: string; content: string }[],
    originalPrompt: string,
    synthesisModelContextLimit: number = 32000,
    maxSynthesisChars: number = MAX_SYNTHESIS_CHARS,
    warningThreshold: number = 0.8
): SynthesisValidationResult {
    // Estimate tokens for original prompt
    const promptTokens = estimateTokens(originalPrompt);

    // Estimate tokens for each response (after truncation)
    let responseTokens = 0;

    for (const response of responses) {
        const content = response.content.length > maxSynthesisChars
            ? response.content.slice(0, maxSynthesisChars)
            : response.content;
        responseTokens += estimateTokens(content);
    }

    // Add overhead for synthesis prompt template (~500 tokens)
    const templateOverhead = 500;

    // Reserve tokens for the model's response (~4000 tokens minimum)
    const responseReserve = 4000;

    const totalEstimatedTokens = promptTokens + responseTokens + templateOverhead;
    const maxInputTokens = synthesisModelContextLimit - responseReserve;

    if (totalEstimatedTokens > maxInputTokens) {
        return {
            isValid: false,
            estimatedTokens: totalEstimatedTokens,
            maxTokens: maxInputTokens,
            warning: `Synthesis prompt (~${totalEstimatedTokens} tokens) may exceed context limit (${maxInputTokens} tokens available). Some responses may need to be truncated further.`
        };
    }

    if (totalEstimatedTokens > maxInputTokens * warningThreshold) {
        return {
            isValid: true,
            estimatedTokens: totalEstimatedTokens,
            maxTokens: maxInputTokens,
            warning: `Synthesis prompt is using ${Math.round(totalEstimatedTokens / maxInputTokens * 100)}% of available context.`
        };
    }

    return {
        isValid: true,
        estimatedTokens: totalEstimatedTokens,
        maxTokens: maxInputTokens
    };
}


