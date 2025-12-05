// OpenRouter API client using the official SDK
import { OpenRouter } from '@openrouter/sdk';
import { ReasoningParams } from '@/types';
import { OpenRouterUsage, OpenRouterDelta } from '@/types/openrouter.types';
import { MAX_SYNTHESIS_CHARS, MAX_RETRIES, INITIAL_RETRY_DELAY_MS } from '@/lib/constants';

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
                    messages: [{ role: 'user', content: prompt }],
                    reasoning: reasoning,
                    stream: true,
                    streamOptions: { includeUsage: true }
                },
                { signal }
            );

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
                const delta = chunk.choices?.[0]?.delta as OpenRouterDelta | undefined;
                const reasoningContent = delta?.reasoning || delta?.reasoning_details?.text || null;

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
            if (error instanceof Error) {
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
    modelResponses: { modelId: string; content: string }[]
): string {
    const validResponses = modelResponses.filter(r => r.content && !r.content.startsWith('Error:'));

    if (validResponses.length === 0) {
        throw new Error('No valid responses to synthesize');
    }

    let synthesisPrompt = `You are tasked with synthesizing responses from ${validResponses.length} different AI models into a single, optimal response.

Original User Prompt:
"${originalPrompt}"

Here are the responses from different models:

`;

    validResponses.forEach((response, index) => {
        // Truncate response if it's too long to prevent excessive context usage
        // 8000 chars is roughly 2000 tokens, which is a reasonable contribution per model
        // for a synthesis task without blowing up the context window of the synthesizer.
        let content = response.content;

        if (content.length > MAX_SYNTHESIS_CHARS) {
            content = content.slice(0, MAX_SYNTHESIS_CHARS) + '\n\n[...Truncated for synthesis...]';
        }

        synthesisPrompt += `--- Response ${index + 1} (from ${response.modelId}) ---
${content}

`;
    });

    synthesisPrompt += `---

Please provide a comprehensive, synthesized response that:
1. Combines the best insights and information from all responses
2. Resolves any contradictions by using the most accurate information
3. Maintains a clear, coherent structure
4. Is accurate, complete, and well-organized

Synthesized Response:`;

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

