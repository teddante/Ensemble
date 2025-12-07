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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    per_request_limits?: any;
}

export interface ReasoningParams {
    effort?: 'high' | 'medium' | 'low' | 'minimal' | 'none';
    max_tokens?: number;
    exclude?: boolean;
    enabled?: boolean;
}

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ModelResponse {
    modelId: string;
    content: string;
    status: 'pending' | 'streaming' | 'complete' | 'error';
    error?: string;
    tokens?: number; // Usage tokens (input + output)
    wordCount?: number; // Actual word count of the content
}

export interface GenerationRequest {
    prompt: string;
    messages?: Message[];
    models: string[];
    apiKey: string;
    refinementModel?: string;
    systemPrompt?: string;
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
    | 'warning';
    modelId?: string;
    content?: string;
    reasoning?: string; // Content for reasoning/thinking chunks
    error?: string;
    warning?: string;

    tokens?: number;
    wordCount?: number;
}

export interface Settings {
    apiKey: string;
    selectedModels: string[];
    refinementModel: string;
    maxSynthesisChars: number;
    contextWarningThreshold: number;
    systemPrompt: string;
}

export const FALLBACK_MODELS: Model[] = [
    {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'Anthropic',
        description: 'Most intelligent Claude model'
    },
    {
        id: 'google/gemini-2.0-flash-exp:free',
        name: 'Gemini 2.0 Flash',
        provider: 'Google',
        description: 'Google latest experimental model (Free)'
    },
    {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        description: 'OpenAI flagship multimodal model'
    },
    {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
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
        id: 'meta-llama/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B',
        provider: 'Meta',
        description: 'Open source Llama model'
    },
    {
        id: 'mistralai/mistral-large',
        name: 'Mistral Large',
        provider: 'Mistral',
        description: 'Mistral flagship model'
    },
    {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'DeepSeek',
        description: 'DeepSeek V3 model'
    }
];

export const DEFAULT_SELECTED_MODELS = [
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'google/gemini-2.0-flash-exp:free'
];

export const DEFAULT_REFINEMENT_MODEL = 'anthropic/claude-3.5-sonnet';

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
