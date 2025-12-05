// OpenRouter API client using the official SDK
import { OpenRouter } from '@openrouter/sdk';
import { ReasoningParams } from '@/types';

export const MAX_SYNTHESIS_CHARS = 8000;

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
    onComplete: (fullContent: string, usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void;
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
    let fullContent = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalUsage: any;

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
                onError(chunk.error.message || 'Unknown error');
                return;
            }

            // Handle usage if present (usually in the last chunk)
            if (chunk.usage) {
                finalUsage = chunk.usage;
            }

            // Handle reasoning/thinking tokens
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reasoningContent = (chunk.choices?.[0]?.delta as any)?.reasoning ||
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (chunk.choices?.[0]?.delta as any)?.reasoning_details?.text ||
                null;

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

        onComplete(fullContent, finalUsage);
    } catch (error) {
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                onError('Request cancelled');
            } else {
                onError(error.message);
            }
        } else {
            onError('Unknown error occurred');
        }
    }
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
