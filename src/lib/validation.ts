// Input validation utilities

const DANGEROUS_PATTERNS = [
    /\{\{.*\}\}/g,  // Template injection
    /<script[^>]*>.*<\/script>/gi,  // Script tags
    /javascript:/gi,  // JavaScript protocol
    /on\w+\s*=/gi,  // Event handlers
];

const MAX_PROMPT_LENGTH = 50000;
const MIN_PROMPT_LENGTH = 1;

export interface ValidationResult {
    isValid: boolean;
    error?: string;
    sanitized?: string;
}

export function validatePrompt(prompt: string): ValidationResult {
    // Check if prompt exists
    if (!prompt || typeof prompt !== 'string') {
        return { isValid: false, error: 'Prompt is required' };
    }

    const trimmed = prompt.trim();

    // Check length
    if (trimmed.length < MIN_PROMPT_LENGTH) {
        return { isValid: false, error: 'Prompt cannot be empty' };
    }

    if (trimmed.length > MAX_PROMPT_LENGTH) {
        return {
            isValid: false,
            error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`
        };
    }

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { isValid: false, error: 'Prompt contains invalid content' };
        }
    }

    return { isValid: true, sanitized: trimmed };
}

export function validateApiKey(apiKey: string): ValidationResult {
    if (!apiKey || typeof apiKey !== 'string') {
        return { isValid: false, error: 'API key is required' };
    }

    const trimmed = apiKey.trim();

    if (trimmed.length < 10) {
        return { isValid: false, error: 'API key appears to be invalid' };
    }

    // Basic format check - OpenRouter keys typically start with 'sk-'
    if (!trimmed.startsWith('sk-')) {
        return { isValid: false, error: 'API key should start with "sk-"' };
    }

    return { isValid: true, sanitized: trimmed };
}

export function validateModels(models: string[]): ValidationResult {
    if (!Array.isArray(models) || models.length === 0) {
        return { isValid: false, error: 'At least one model must be selected' };
    }

    if (models.length > 10) {
        return { isValid: false, error: 'Maximum of 10 models can be selected' };
    }

    // Validate model ID format (provider/model-name)
    const modelPattern = /^[\w-]+\/[\w.-]+(?::[\w]+)?$/;
    for (const model of models) {
        if (!modelPattern.test(model)) {
            return { isValid: false, error: `Invalid model format: ${model}` };
        }
    }

    return { isValid: true };
}
