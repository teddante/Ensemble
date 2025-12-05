// Proper TypeScript types for OpenRouter SDK responses
// Updated to match OpenRouter docs: https://openrouter.ai/docs

export interface OpenRouterUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

// Reasoning detail types as per OpenRouter docs
// https://openrouter.ai/docs/api-reference/reasoning
export type ReasoningDetailFormat =
    | 'unknown'
    | 'openai-responses-v1'
    | 'xai-responses-v1'
    | 'anthropic-claude-v1';

export interface ReasoningDetailBase {
    id: string | null;
    format: ReasoningDetailFormat;
    index?: number;
}

export interface ReasoningDetailSummary extends ReasoningDetailBase {
    type: 'reasoning.summary';
    summary: string;
}

export interface ReasoningDetailEncrypted extends ReasoningDetailBase {
    type: 'reasoning.encrypted';
    data: string;
}

export interface ReasoningDetailText extends ReasoningDetailBase {
    type: 'reasoning.text';
    text: string;
    signature?: string | null;
}

export type ReasoningDetail =
    | ReasoningDetailSummary
    | ReasoningDetailEncrypted
    | ReasoningDetailText;

export interface OpenRouterDelta {
    content?: string;
    role?: string;
    // Legacy field for backward compatibility
    reasoning?: string;
    // New structured reasoning details array as per docs
    reasoning_details?: ReasoningDetail[];
    tool_calls?: OpenRouterToolCall[];
}

export interface OpenRouterToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface OpenRouterChoice {
    delta?: OpenRouterDelta;
    message?: OpenRouterDelta;
    index: number;
    finish_reason?: string | null;
    native_finish_reason?: string | null;
}

export interface OpenRouterStreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices?: OpenRouterChoice[];
    usage?: OpenRouterUsage;
    system_fingerprint?: string;
    error?: {
        message: string;
        code?: number | string;
        type?: string;
        metadata?: Record<string, unknown>;
    };
}

// Extended pricing object matching OpenRouter docs
export interface OpenRouterPricing {
    prompt: string;           // Cost per input token
    completion: string;       // Cost per output token
    request?: string;         // Fixed cost per API request
    image?: string;           // Cost per image input
    web_search?: string;      // Cost per web search operation
    internal_reasoning?: string; // Cost for internal reasoning tokens
    input_cache_read?: string;   // Cost per cached input token read
    input_cache_write?: string;  // Cost per cached input token write
}

export interface OpenRouterModel {
    id: string;
    name: string;
    description?: string;
    context_length?: number;
    // Extended fields from OpenRouter docs
    canonical_slug?: string;     // Permanent slug that never changes
    created?: number;            // Unix timestamp when added to OpenRouter
    supported_parameters?: string[]; // Supported API parameters for this model
    pricing?: OpenRouterPricing;
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
    per_request_limits?: Record<string, unknown> | null;
}

export interface OpenRouterModelsResponse {
    data: OpenRouterModel[];
}
