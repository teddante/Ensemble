'use client';

import { useState, useEffect } from 'react';
import { Model, FALLBACK_MODELS } from '@/types';

const CACHE_KEY = 'ensemble_models_cache';
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

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
            if (Date.now() - parsed.timestamp < CACHE_TTL) {
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

export function useModels() {
    const [models, setModels] = useState<Model[]>(() => {
        // Initialize with cache if available, otherwise fallback
        const cached = getCachedModels();
        return cached?.models || FALLBACK_MODELS;
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchModels = async () => {
            // Check cache first
            const cached = getCachedModels();
            if (cached) {
                setModels(cached.models);
                setIsLoading(false);
                // Continue to fetch fresh data in background (stale-while-revalidate)
            }

            try {
                const response = await fetch('/api/models');
                if (!response.ok) throw new Error('Failed to fetch models');

                const data = await response.json();
                if (data.models && Array.isArray(data.models)) {
                    setModels(data.models);
                    setCachedModels(data.models);
                } else {
                    console.warn('API returned invalid format, using fallback models');
                }
            } catch (err) {
                console.error('Error fetching models:', err);
                setError('Using offline models');
                // Keep using cached or fallback models
            } finally {
                setIsLoading(false);
            }
        };

        fetchModels();
    }, []);

    return { models, isLoading, error };
}

