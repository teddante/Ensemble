'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Model, FALLBACK_MODELS, validateSelectedModels } from '@/types';
import { MODELS_CACHE_TTL, MAX_RETRIES, INITIAL_RETRY_DELAY_MS } from '@/lib/constants';

const CACHE_KEY = 'ensemble_models_cache';
const VALIDATED_FALLBACK_KEY = 'ensemble_validated_fallback';

interface CachedModels {
    models: Model[];
    timestamp: number;
}

interface ValidatedFallback {
    validModelIds: string[];
    invalidModelIds: string[];
    timestamp: number;
}

function getCachedModels(): CachedModels | null {
    if (typeof window === 'undefined') return null;

    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const parsed: CachedModels = JSON.parse(cached);
            // Return cache if still valid
            if (Date.now() - parsed.timestamp < MODELS_CACHE_TTL) {
                return parsed;
            }
        }
    } catch (error) {
        console.error('Failed to read models cache:', error);
    }
    return null;
}

function setCachedModels(models: Model[]): void {
    if (typeof window === 'undefined') return;

    try {
        const cache: CachedModels = {
            models,
            timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.error('Failed to cache models:', error);
    }
}

/**
 * Get previously validated fallback model IDs from localStorage
 */
function getValidatedFallback(): ValidatedFallback | null {
    if (typeof window === 'undefined') return null;

    try {
        const cached = localStorage.getItem(VALIDATED_FALLBACK_KEY);
        if (cached) {
            const parsed: ValidatedFallback = JSON.parse(cached);
            // Return if still valid (same TTL as models cache)
            if (Date.now() - parsed.timestamp < MODELS_CACHE_TTL) {
                return parsed;
            }
        }
    } catch (error) {
        console.error('Failed to read validated fallback cache:', error);
    }
    return null;
}

/**
 * Store validated fallback model IDs in localStorage
 */
function setValidatedFallback(validModelIds: string[], invalidModelIds: string[]): void {
    if (typeof window === 'undefined') return;

    try {
        const cache: ValidatedFallback = {
            validModelIds,
            invalidModelIds,
            timestamp: Date.now(),
        };
        localStorage.setItem(VALIDATED_FALLBACK_KEY, JSON.stringify(cache));
    } catch (error) {
        console.error('Failed to cache validated fallback:', error);
    }
}

/**
 * Validate FALLBACK_MODELS against live API models
 * Returns only the fallback models that still exist
 */
function validateFallbackModels(liveModels: Model[]): { valid: Model[]; invalidIds: string[] } {
    const fallbackIds = FALLBACK_MODELS.map(m => m.id);
    const { validModels, invalidModels } = validateSelectedModels(fallbackIds, liveModels);

    // Log warning for stale models
    if (invalidModels.length > 0) {
        console.warn(
            `[Ensemble] Stale fallback models detected and filtered out: ${invalidModels.join(', ')}`
        );
    }

    // Return validated fallback models (models from live API matching fallback IDs)
    const validFallback = liveModels.filter(m => validModels.includes(m.id));

    return { valid: validFallback, invalidIds: invalidModels };
}

/**
 * Get initial fallback models, filtering out previously known stale models
 */
function getInitialFallbackModels(): Model[] {
    const validated = getValidatedFallback();
    if (validated && validated.invalidModelIds.length > 0) {
        // Filter out known stale models from fallback
        return FALLBACK_MODELS.filter(m => !validated.invalidModelIds.includes(m.id));
    }
    return FALLBACK_MODELS;
}

async function wait(attempt: number): Promise<void> {
    const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
    await new Promise(resolve => setTimeout(resolve, delay));
}

export interface RemovedModelInfo {
    modelId: string;
    reason: 'unavailable';
}

export function useModels() {
    const [models, setModels] = useState<Model[]>(() => {
        // Initialize with cache if available, otherwise use filtered fallback
        const cached = getCachedModels();
        return cached?.models || getInitialFallbackModels();
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isValidating, setIsValidating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [staleModelIds, setStaleModelIds] = useState<string[]>(() => {
        // Initialize with known stale models from localStorage
        const validated = getValidatedFallback();
        return validated?.invalidModelIds || [];
    });
    const [removedSelectedModels, setRemovedSelectedModels] = useState<RemovedModelInfo[]>([]);

    // Track if validation has been done to prevent re-notifications
    const validationDoneRef = useRef(false);

    // Memoize stale models warning message
    const staleModelsWarning = useMemo(() => {
        if (staleModelIds.length === 0) return null;
        return `Some default models are no longer available: ${staleModelIds.join(', ')}`;
    }, [staleModelIds]);

    // Memoize removed selected models warning message
    const removedModelsWarning = useMemo(() => {
        if (removedSelectedModels.length === 0) return null;
        const names = removedSelectedModels.map(r => r.modelId);
        return `The following models were removed from your selection (no longer available): ${names.join(', ')}`;
    }, [removedSelectedModels]);

    /**
     * Validate user-selected models against live models
     * Returns list of removed models for UI feedback
     */
    const validateUserSelectedModels = useCallback((
        selectedModels: string[],
        liveModels: Model[]
    ): { validModels: string[]; removedModels: RemovedModelInfo[] } => {
        const { validModels, invalidModels } = validateSelectedModels(selectedModels, liveModels);

        const removedModels: RemovedModelInfo[] = invalidModels.map(modelId => ({
            modelId,
            reason: 'unavailable' as const
        }));

        return { validModels, removedModels };
    }, []);

    /**
     * Clear the removed models notification
     */
    const dismissRemovedModelsWarning = useCallback(() => {
        setRemovedSelectedModels([]);
    }, []);

    const fetchModels = useCallback(async (isRetry = false) => {
        if (!isRetry) {
            // Check cache first (only on initial load)
            const cached = getCachedModels();
            if (cached) {
                setModels(cached.models);
                setIsLoading(false);
                // Continue to fetch fresh data in background (stale-while-revalidate)
            }
        }

        let lastError: Error | null = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const response = await fetch('/api/models', {
                    headers: { 'X-Requested-With': 'fetch' }
                });
                if (!response.ok) throw new Error('Failed to fetch models');

                const data = await response.json();
                if (data.models && Array.isArray(data.models)) {
                    // Validate fallback models against live API on successful fetch
                    const { invalidIds } = validateFallbackModels(data.models);
                    setValidatedFallback(
                        FALLBACK_MODELS.filter(m => !invalidIds.includes(m.id)).map(m => m.id),
                        invalidIds
                    );
                    setStaleModelIds(invalidIds);

                    setModels(data.models);
                    setCachedModels(data.models);
                    setError(null);
                    setIsLoading(false);
                    return; // Success
                } else {
                    console.warn('API returned invalid format, using fallback models');
                    break;
                }
            } catch (err) {
                lastError = err instanceof Error ? err : new Error('Unknown error');
                console.warn(`Models fetch attempt ${attempt + 1} failed:`, lastError.message);

                if (attempt < MAX_RETRIES - 1) {
                    await wait(attempt);
                }
            }
        }

        // All retries exhausted
        console.error('Error fetching models after retries:', lastError);
        setError('Using offline models');
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

    const retryFetching = useCallback(() => {
        setIsLoading(true);
        setError(null);
        fetchModels(true);
    }, [fetchModels]);

    /**
     * Reset validation state (useful when user manually changes selection)
     */
    const resetValidationState = useCallback(() => {
        validationDoneRef.current = false;
        setRemovedSelectedModels([]);
    }, []);

    return {
        models,
        isLoading,
        isValidating,
        setIsValidating,
        error,
        staleModelIds,
        staleModelsWarning,
        removedSelectedModels,
        removedModelsWarning,
        setRemovedSelectedModels,
        validateUserSelectedModels,
        dismissRemovedModelsWarning,
        resetValidationState,
        validationDoneRef,
        retryFetching
    };
}


