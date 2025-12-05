'use client';

import { useState, useEffect } from 'react';
import { Model, FALLBACK_MODELS } from '@/types';

export function useModels() {
    const [models, setModels] = useState<Model[]>(FALLBACK_MODELS);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchModels = async () => {
            try {
                const response = await fetch('/api/models');
                if (!response.ok) throw new Error('Failed to fetch models');

                const data = await response.json();
                if (data.models && Array.isArray(data.models)) {
                    setModels(data.models);
                } else {
                    console.warn('API returned invalid format, using fallback models');
                }
            } catch (err) {
                console.error('Error fetching models:', err);
                setError('Using offline models');
            } finally {
                setIsLoading(false);
            }
        };

        fetchModels();
    }, []);

    return { models, isLoading, error };
}
