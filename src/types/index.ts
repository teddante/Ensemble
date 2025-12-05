// Types for the Ensemble web application

export interface Model {
    id: string;
    name: string;
    provider: string;
    description: string;
    contextWindow?: number;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    per_request_limits?: any;
}

export interface ReasoningParams {
    effort?: 'high' | 'medium' | 'low' | 'minimal' | 'none';
    max_tokens?: number;
    exclude?: boolean;
    enabled?: boolean;
}

export interface ModelResponse {
    modelId: string;
    content: string;
    status: 'pending' | 'streaming' | 'complete' | 'error';
    error?: string;
    tokens?: number; // Approximate word count
}

export interface GenerationRequest {
    prompt: string;
    models: string[];
    apiKey: string;
    refinementModel?: string;
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
    | 'error';
    modelId?: string;
    content?: string;
    reasoning?: string; // Content for reasoning/thinking chunks
    error?: string;
    tokens?: number;
}

export interface Settings {
    apiKey: string;
    selectedModels: string[];
    refinementModel: string;
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
