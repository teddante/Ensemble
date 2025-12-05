// OpenRouter API client using the official SDK
import { OpenRouter } from '@openrouter/sdk';

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
    onChunk: (content: string) => void;
    onComplete: (fullContent: string) => void;
    onError: (error: string) => void;
    signal?: AbortSignal;
}

export async function streamModelResponse({
    prompt,
    model,
    apiKey,
    onChunk,
    onComplete,
    onError,
    signal,
}: StreamOptions): Promise<void> {
    const client = createOpenRouterClient(apiKey);
    let fullContent = '';

    try {
        const stream = await client.chat.send(
            {
                model,
                messages: [{ role: 'user', content: prompt }],
                stream: true,
            },
            { signal }
        );

        for await (const chunk of stream) {
            // Check for errors in chunk
            if ('error' in chunk && chunk.error) {
                onError(chunk.error.message || 'Unknown error');
                return;
            }

            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
                fullContent += content;
                onChunk(content);
            }
        }

        onComplete(fullContent);
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
        synthesisPrompt += `--- Response ${index + 1} (from ${response.modelId}) ---
${response.content}

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
