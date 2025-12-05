'use client';

import { useState, useEffect, useCallback } from 'react';
import { Model, FALLBACK_MODELS } from '@/types';
import { MODELS_CACHE_TTL, MAX_RETRIES, INITIAL_RETRY_DELAY_MS } from '@/lib/constants';

const CACHE_KEY = 'ensemble_models_cache';

interface CachedModels {
    models: Model[];
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

async function wait(attempt: number): Promise<void> {
    const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
    await new Promise(resolve => setTimeout(resolve, delay));
}

export function useModels() {
    const [models, setModels] = useState<Model[]>(() => {
        // Initialize with cache if available, otherwise fallback
        const cached = getCachedModels();
        return cached?.models || FALLBACK_MODELS;
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    return { models, isLoading, error, retryFetching };
}


