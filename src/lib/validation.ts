// Input validation utilities

import { MIN_PROMPT_LENGTH, MIN_API_KEY_LENGTH } from './constants';

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

    // Check minimum length only - let models handle max context limits
    if (trimmed.length < MIN_PROMPT_LENGTH) {
        return { isValid: false, error: 'Prompt cannot be empty' };
    }

    // No artificial max length - models will return errors if prompt exceeds their context
    // This allows users to fully utilize large context models like Claude (200k) or Gemini (1M+)

    return { isValid: true, sanitized: trimmed };
}

export function validateApiKey(apiKey: string): ValidationResult {
    if (!apiKey || typeof apiKey !== 'string') {
        return { isValid: false, error: 'API key is required' };
    }

    const trimmed = apiKey.trim();

    if (trimmed.length < MIN_API_KEY_LENGTH) {
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

    // No artificial max model limit - user is paying for each query, let them choose
    // OpenRouter will handle any actual limits

    // Validate model ID format (provider/model-name)
    const modelPattern = /^[\w-]+\/[\w.-]+(?::[\w]+)?$/;
    for (const model of models) {
        if (!modelPattern.test(model)) {
            return { isValid: false, error: `Invalid model format: ${model}` };
        }
    }

    return { isValid: true };
}
