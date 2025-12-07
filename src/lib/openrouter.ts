// OpenRouter API client using the official SDK
import { OpenRouter } from '@openrouter/sdk';
import { ReasoningParams, Message } from '@/types';
import { OpenRouterUsage, OpenRouterDelta } from '@/types/openrouter.types';
import { MAX_SYNTHESIS_CHARS, MAX_RETRIES, INITIAL_RETRY_DELAY_MS, REQUEST_TIMEOUT_MS } from '@/lib/constants';

// Re-export for backward compatibility
export { MAX_SYNTHESIS_CHARS };

// Retry configuration
const RETRYABLE_STATUS_CODES = [429, 502, 503, 504];

// Check if an error is retryable
function isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        // Check for rate limiting or server errors
        if (message.includes('rate limit') ||
            message.includes('too many requests') ||
            message.includes('service unavailable') ||
            message.includes('bad gateway') ||
            message.includes('gateway timeout')) {
            return true;
        }
        // Check for status code in error message
        for (const code of RETRYABLE_STATUS_CODES) {
            if (message.includes(String(code))) {
                return true;
            }
        }
    }
    return false;
}

// Wait with exponential backoff
async function wait(attempt: number): Promise<void> {
    const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
    await new Promise(resolve => setTimeout(resolve, delay));
}

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

    // Create a combined signal with timeout
    // AbortSignal.any() is available in modern runtimes (Node 20+, Edge)
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combinedSignal = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;

    let lastError: Error | null = null;

    // Prepare messages for chat completion
    const chatMessages = messages && messages.length > 0
        ? messages
        : [{ role: 'user', content: prompt }];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // Check if already aborted
        if (signal?.aborted) {
            onError('Request cancelled');
            return;
        }

        let fullContent = '';
        let finalUsage: OpenRouterUsage | undefined;

        try {
            const stream = await client.chat.send(
                {
                    model,
                    messages: chatMessages as any[],
                    reasoning: reasoning,
                    stream: true,
                    // Use snake_case for OpenAI compatibility
                    // @ts-ignore - OpenRouter SDK types expect streamOptions but API supports stream_options
                    stream_options: { include_usage: true }
                } as any,
                { signal: combinedSignal }
            ) as any;

            for await (const chunk of stream) {
                // Check for errors in chunk
                if ('error' in chunk && chunk.error) {
                    const errorMessage = chunk.error.message || 'Unknown error';

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
                        prompt_tokens: chunk.usage.promptTokens ?? 0,
                        completion_tokens: chunk.usage.completionTokens ?? 0,
                        total_tokens: chunk.usage.totalTokens ?? 0,
                    };
                }

                // Handle reasoning/thinking tokens
                // Supports both legacy format and new structured reasoning_details array
                const delta = chunk.choices?.[0]?.delta as OpenRouterDelta | undefined;

                // Extract reasoning from structured reasoning_details array (new format per OpenRouter docs)
                let reasoningContent: string | null = null;
                if (delta?.reasoning_details && Array.isArray(delta.reasoning_details)) {
                    for (const detail of delta.reasoning_details) {
                        if (detail.type === 'reasoning.text' && 'text' in detail) {
                            reasoningContent = detail.text;
                            break;
                        } else if (detail.type === 'reasoning.summary' && 'summary' in detail) {
                            reasoningContent = detail.summary;
                            break;
                        }
                        // Note: reasoning.encrypted type contains 'data' field but is redacted
                    }
                }

                // Fall back to legacy reasoning field for backward compatibility
                if (!reasoningContent && delta?.reasoning) {
                    reasoningContent = delta.reasoning;
                }

                if (reasoningContent && onReasoning) {
                    onReasoning(reasoningContent);
                }

                // Handle content tokens
                const content = chunk.choices?.[0]?.delta?.content;
                if (content) {
                    fullContent += content;
                    onChunk(content);
                }
            }

            // If we got here without breaking, stream completed successfully
            if (!lastError || fullContent.length > 0) {
                onComplete(fullContent, finalUsage);
                return;
            }
        } catch (error) {
            console.error(`Stream error for model ${model}:`, error); // Log the real error
            if (error instanceof Error) {
                // Check if timeout vs user cancellation
                if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
                    onError('Request timed out - the model took too long to respond');
                    return;
                }
                if (error.name === 'AbortError') {
                    onError('Request cancelled');
                    return;
                }

                // Check if retryable
                if (attempt < MAX_RETRIES && isRetryableError(error)) {
                    lastError = error;
                    console.warn(`Retry attempt ${attempt + 1} for model ${model}: ${error.message}`);
                    await wait(attempt);
                    continue;
                }

                onError(error.message);
                return;
            } else {
                onError('Unknown error occurred');
                return;
            }
        }

        // If we have a retryable error and more attempts, wait and retry
        if (lastError && attempt < MAX_RETRIES) {
            console.warn(`Retry attempt ${attempt + 1} for model ${model}: ${lastError.message}`);
            await wait(attempt);
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
    const words = text.split(/\s+/).filter(Boolean).length;

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


