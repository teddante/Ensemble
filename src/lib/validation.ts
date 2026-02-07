// Input validation utilities

import { MIN_PROMPT_LENGTH, MIN_API_KEY_LENGTH } from './constants';

export interface ValidationResult {
    isValid: boolean;
    error?: string;
    sanitized?: string;
}

function validateString(
    value: string,
    fieldName: string,
    minLength: number,
    minLengthError: string,
): ValidationResult {
    if (!value || typeof value !== 'string') {
        return { isValid: false, error: `${fieldName} is required` };
    }

    const trimmed = value.trim();

    if (trimmed.length < minLength) {
        return { isValid: false, error: minLengthError };
    }

    return { isValid: true, sanitized: trimmed };
}

export function validatePrompt(prompt: string): ValidationResult {
    return validateString(prompt, 'Prompt', MIN_PROMPT_LENGTH, 'Prompt cannot be empty');
}

export function validateApiKey(apiKey: string): ValidationResult {
    const base = validateString(apiKey, 'API key', MIN_API_KEY_LENGTH, 'API key appears to be invalid');
    if (!base.isValid) return base;

    if (!base.sanitized!.startsWith('sk-')) {
        return { isValid: false, error: 'API key should start with "sk-"' };
    }

    return base;
}

export function validateModels(models: string[]): ValidationResult {
    if (!Array.isArray(models) || models.length === 0) {
        return { isValid: false, error: 'At least one model must be selected' };
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
