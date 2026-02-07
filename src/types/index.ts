// Types for the Ensemble web application

export interface Model {
    id: string;
    name: string;
    provider: string;
    description: string;
    contextWindow?: number;
    // Extended fields from OpenRouter docs
    canonical_slug?: string;
    created?: number;
    supported_parameters?: string[];
    pricing?: {
        prompt: string;
        completion: string;
        request?: string;
        image?: string;
        web_search?: string;
        internal_reasoning?: string;
        input_cache_read?: string;
        input_cache_write?: string;
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
    per_request_limits?: { promptTokens: number; completionTokens: number } | null;
}

export interface ReasoningParams {
    effort?: 'high' | 'medium' | 'low' | 'minimal' | 'none' | 'xhigh';
    max_tokens?: number;
    exclude?: boolean;
    enabled?: boolean;
}

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ModelResponse {
    responseId?: string; // Unique identifier for each selected model instance
    modelId: string;
    content: string;
    status: 'pending' | 'streaming' | 'complete' | 'error';
    error?: string;
    tokens?: number; // Usage tokens (input + output)
    wordCount?: number; // Actual word count of the content
    promptData?: {
        messages: Message[];
        modelId: string;
    };
}

export interface StreamEvent {
    type:
    | 'model_start'
    | 'model_reasoning' // New event type for reasoning chunks
    | 'model_chunk'
    | 'model_complete'
    | 'model_error'
    | 'synthesis_start'
    | 'synthesis_chunk'
    | 'synthesis_complete'
    | 'complete'
    | 'error'
    | 'warning'
    | 'debug_prompt';
    instanceId?: string; // Unique identifier for duplicate model instances
    modelId?: string;
    content?: string;
    reasoning?: string; // Content for reasoning/thinking chunks
    error?: string;
    warning?: string;
    promptData?: {
        messages: Message[];
        modelId: string;
    };

    tokens?: number;
    wordCount?: number;
}

export interface ModelConfig {
    reasoning?: {
        enabled: boolean;
        effort?: ReasoningParams['effort'];
    };
}

export interface Settings {
    apiKey: string;
    selectedModels: string[];
    modelConfigs: Record<string, ModelConfig>;
    refinementModel: string;
    maxSynthesisChars: number;
    contextWarningThreshold: number;
    systemPrompt: string;
}

export const FALLBACK_MODELS: Model[] = [
    {
        id: 'anthropic/claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        provider: 'Anthropic',
        description: 'Most intelligent Claude model'
    },
    {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'Google',
        description: 'Google state-of-the-art reasoning model'
    },
    {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        description: 'OpenAI flagship multimodal model'
    },
    {
        id: 'anthropic/claude-haiku-3.5',
        name: 'Claude 3.5 Haiku',
        provider: 'Anthropic',
        description: 'Fast and affordable Claude model'
    },
    {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'OpenAI',
        description: 'Affordable and fast OpenAI model'
    },
    {
        id: 'meta-llama/llama-3.3-70b-instruct',
        name: 'Llama 3.3 70B',
        provider: 'Meta',
        description: 'Open source Llama model'
    },
    {
        id: 'mistralai/mistral-large-2411',
        name: 'Mistral Large',
        provider: 'Mistral',
        description: 'Mistral flagship model'
    },
    {
        id: 'deepseek/deepseek-chat-v3-0324',
        name: 'DeepSeek Chat V3',
        provider: 'DeepSeek',
        description: 'DeepSeek V3 model'
    }
];

export const DEFAULT_SELECTED_MODELS = [
    'anthropic/claude-sonnet-4.5',
    'openai/gpt-4o',
    'google/gemini-2.5-flash'
];

export const DEFAULT_REFINEMENT_MODEL = 'anthropic/claude-sonnet-4.5';

/**
 * Validates selected models against available models list
 * Filters out any models that no longer exist and ensures at least one valid model
 */
export function validateSelectedModels(
    selectedModels: string[],
    availableModels: Model[]
): { validModels: string[]; invalidModels: string[] } {
    const availableIds = new Set(availableModels.map(m => m.id));

    const validModels = selectedModels.filter(id => availableIds.has(id));
    const invalidModels = selectedModels.filter(id => !availableIds.has(id));

    // If no valid models, fallback to defaults that are available
    if (validModels.length === 0) {
        const fallbackModels = DEFAULT_SELECTED_MODELS.filter(id => availableIds.has(id));
        // If even defaults aren't available, use first available model
        if (fallbackModels.length === 0 && availableModels.length > 0) {
            return { validModels: [availableModels[0].id], invalidModels };
        }
        return { validModels: fallbackModels, invalidModels };
    }

    return { validModels, invalidModels };
}
