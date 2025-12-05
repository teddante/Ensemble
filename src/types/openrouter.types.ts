// Proper TypeScript types for OpenRouter SDK responses

export interface OpenRouterUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface OpenRouterDelta {
    content?: string;
    reasoning?: string;
    reasoning_details?: {
        text: string;
    };
}

export interface OpenRouterChoice {
    delta?: OpenRouterDelta;
    index: number;
    finish_reason?: string | null;
}

export interface OpenRouterStreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices?: OpenRouterChoice[];
    usage?: OpenRouterUsage;
    error?: {
        message: string;
        code?: string;
        type?: string;
    };
}

export interface OpenRouterModel {
    id: string;
    name: string;
    description?: string;
    context_length?: number;
    pricing?: {
        prompt: string;
        completion: string;
    };
    architecture?: {
        input_modalities: string[];
        output_modalities: string[];
        tokenizer: string;
        instruct_type: string | null;
    };
    top_provider?: {
        context_length: number;
        max_completion_tokens: number;
        is_moderated: boolean;
    };
    per_request_limits?: Record<string, unknown>;
}

export interface OpenRouterModelsResponse {
    data: OpenRouterModel[];
}
