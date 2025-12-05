'use client';

import { useState, useEffect, useCallback } from 'react';
import { ModelResponse } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { MAX_HISTORY_ITEMS } from '@/lib/constants';

export interface HistoryItem {
    id: string;
    timestamp: number;
    prompt: string;
    models: string[]; // Model IDs used
    refinementModel: string;
    responses: ModelResponse[];
    synthesizedContent: string;
}

const STORAGE_KEY = 'ensemble_history';

export function useHistory() {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [storageWarning, setStorageWarning] = useState<string | null>(null);

    // Load history on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setHistory(JSON.parse(stored));
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    }, []);

    // Estimate size of data in bytes
    const estimateSize = useCallback((data: unknown): number => {
        try {
            return new Blob([JSON.stringify(data)]).size;
        } catch {
            return JSON.stringify(data).length * 2; // Fallback: UTF-16 estimate
        }
    }, []);

    // Check localStorage usage percentage
    const checkStorageUsage = useCallback((): number => {
        try {
            let totalSize = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    totalSize += localStorage.getItem(key)?.length || 0;
                }
            }
            // localStorage limit is typically 5MB (5 * 1024 * 1024 bytes)
            const limit = 5 * 1024 * 1024;
            return (totalSize * 2) / limit; // *2 for UTF-16
        } catch {
            return 0;
        }
    }, []);

    const saveToLocalStorage = useCallback((items: HistoryItem[]) => {
        let itemsToSave = items;
        let evictedCount = 0;

        // Proactive check: warn if approaching quota (80% threshold)
        const usage = checkStorageUsage();
        if (usage > 0.8 && usage < 1) {
            setStorageWarning(`Storage ${Math.round(usage * 100)}% full - older history items may be removed`);
            setTimeout(() => setStorageWarning(null), 5000);
        }

        // Try to save with progressive eviction
        while (itemsToSave.length > 0) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(itemsToSave));

                if (evictedCount > 0) {
                    setStorageWarning(`Removed ${evictedCount} oldest items due to storage limits`);
                    // Clear warning after 5 seconds
                    setTimeout(() => setStorageWarning(null), 5000);
                }
                return itemsToSave;
            } catch (error) {
                if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                    // Remove oldest item (LRU eviction)
                    itemsToSave = itemsToSave.slice(0, -1);
                    evictedCount++;
                } else {
                    console.error('Failed to save history:', error);
                    return items; // Return original items on non-quota error
                }
            }
        }

        // If we get here, we couldn't save anything
        console.error('Failed to save history: storage quota exhausted');
        localStorage.removeItem(STORAGE_KEY);
        setStorageWarning('History cleared due to storage limits');
        return [];
    }, [checkStorageUsage]);

    const addToHistory = useCallback((
        prompt: string,
        models: string[],
        refinementModel: string,
        responses: ModelResponse[],
        synthesizedContent: string
    ) => {
        const newItem: HistoryItem = {
            id: uuidv4(),
            timestamp: Date.now(),
            prompt,
            models,
            refinementModel,
            responses,
            synthesizedContent
        };

        setHistory(prev => {
            const newHistory = [newItem, ...prev].slice(0, MAX_HISTORY_ITEMS);
            const saved = saveToLocalStorage(newHistory);
            return saved;
        });
    }, [saveToLocalStorage]);

    const deleteItem = useCallback((id: string) => {
        setHistory(prev => {
            const newHistory = prev.filter(item => item.id !== id);
            saveToLocalStorage(newHistory);
            return newHistory;
        });
    }, [saveToLocalStorage]);

    const clearHistory = useCallback(() => {
        setHistory([]);
        setStorageWarning(null);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        history,
        addToHistory,
        deleteItem,
        clearHistory,
        storageWarning
    };
}

