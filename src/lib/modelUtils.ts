// Utility functions for formatting and displaying model metadata

import { Model } from '@/types';

/**
 * Format context window size for display
 * e.g., 128000 -> "128K", 1000000 -> "1M"
 */
export function formatContextLength(tokens: number | undefined): string {
    if (!tokens) return '';

    if (tokens >= 1_000_000) {
        const millions = tokens / 1_000_000;
        return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
    }

    if (tokens >= 1_000) {
        const thousands = tokens / 1_000;
        return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(0)}K`;
    }

    return `${tokens}`;
}

/**
 * Format pricing for display
 * Returns cost per million tokens, or "Free" if zero
 */
export function formatPricing(pricing: Model['pricing']): string {
    if (!pricing) return '';

    const promptCost = parseFloat(pricing.prompt);

    if (promptCost === 0) {
        return 'Free';
    }

    // Convert per-token cost to per-million tokens for readability
    const perMillion = promptCost * 1_000_000;

    if (perMillion < 0.01) {
        return `$${perMillion.toFixed(4)}/M`;
    } else if (perMillion < 1) {
        return `$${perMillion.toFixed(2)}/M`;
    } else {
        return `$${perMillion.toFixed(2)}/M`;
    }
}

/**
 * Get max completion tokens from model's top_provider info
 */
export function formatMaxOutput(model: Model): string {
    const maxTokens = model.top_provider?.max_completion_tokens;
    if (!maxTokens) return '';

    return formatContextLength(maxTokens);
}

/**
 * Get model capabilities based on supported_parameters and architecture
 */
export function getModelCapabilities(model: Model): string[] {
    const capabilities: string[] = [];
    const params = model.supported_parameters || [];
    const inputModalities = model.architecture?.input_modalities || [];

    // Vision capability - model accepts image inputs
    if (inputModalities.includes('image')) {
        capabilities.push('vision');
    }

    // File capability - model accepts file inputs
    if (inputModalities.includes('file')) {
        capabilities.push('files');
    }

    // Tool/function calling capability
    if (params.includes('tools') || params.includes('tool_choice')) {
        capabilities.push('tools');
    }

    // Reasoning capability
    if (params.includes('reasoning') || params.includes('include_reasoning')) {
        capabilities.push('reasoning');
    }

    // Structured outputs (JSON mode)
    if (params.includes('structured_outputs')) {
        capabilities.push('json');
    }

    return capabilities;
}

/**
 * Check if model supports a specific capability
 */
export function hasCapability(model: Model, capability: string): boolean {
    return getModelCapabilities(model).includes(capability);
}

/**
 * Check if a model is free (no prompt/completion cost)
 */
export function isFreeModel(model: Model): boolean {
    if (model.id.includes(':free')) return true;
    if (!model.pricing) return false;
    return parseFloat(model.pricing.prompt) === 0 && parseFloat(model.pricing.completion) === 0;
}

/**
 * Resolve a model ID to its display name, with fallback
 */
export function getModelName(modelId: string, models: Model[]): string {
    const model = models.find(m => m.id === modelId);
    return model?.name || modelId.split('/').pop() || modelId;
}
