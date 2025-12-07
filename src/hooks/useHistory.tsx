'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ModelResponse, Message } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { MAX_HISTORY_ITEMS } from '@/lib/constants';

export interface HistoryItem {
    id: string;
    sessionId?: string; // Optional session ID to group messages
    timestamp: number;
    prompt: string;
    models: string[]; // Model IDs used
    refinementModel: string;
    responses: ModelResponse[];
    synthesizedContent: string;
    modelNames?: Record<string, string>; // Map of model IDs to display names
    synthesisPromptData?: {
        messages: Message[];
        modelId: string;
    };
}

const STORAGE_KEY = 'ensemble_history';

export function useHistory() {
    const [history, setHistory] = useState<HistoryItem[]>(() => {
        if (typeof window !== 'undefined') {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    return JSON.parse(stored);
                }
            } catch (error) {
                console.error('Failed to load history:', error);
            }
        }
        return [];
    });
    const [storageWarning, setStorageWarning] = useState<string | null>(null);



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

    // Debounced save using ref to batch rapid updates (fixes race condition)
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const SAVE_DEBOUNCE_MS = 500;

    const debouncedSave = useCallback((items: HistoryItem[]) => {
        // Clear any pending save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Schedule new save after debounce period
        saveTimeoutRef.current = setTimeout(() => {
            saveToLocalStorage(items);
            saveTimeoutRef.current = null;
        }, SAVE_DEBOUNCE_MS);
    }, [saveToLocalStorage]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    // Effect to persist history whenever it changes
    useEffect(() => {
        if (history.length > 0) { // Only save if we have items (or you might want to save empty array if cleared context, see below)
            debouncedSave(history);
        } else if (history.length === 0 && localStorage.getItem(STORAGE_KEY)) {
            // Handle clear history case
            debouncedSave([]);
        }
    }, [history, debouncedSave]);

    const addToHistory = useCallback((
        prompt: string,
        models: string[],
        refinementModel: string,
        responses: ModelResponse[],
        synthesizedContent: string,
        modelNames?: Record<string, string>, // Optional: map of model IDs to names
        sessionId?: string,
        synthesisPromptData?: { messages: Message[]; modelId: string }
    ) => {
        const newItem: HistoryItem = {
            id: uuidv4(),
            sessionId,
            timestamp: Date.now(),
            prompt,
            models,
            refinementModel,
            responses,
            synthesizedContent,
            modelNames, // Store model names for display when models change
            synthesisPromptData
        };

        setHistory(prev => {
            const newHistory = [newItem, ...prev].slice(0, MAX_HISTORY_ITEMS);
            return newHistory;
        });
    }, []);

    const deleteItem = useCallback((id: string) => {
        setHistory(prev => prev.filter(item => item.id !== id));
    }, []);

    const updateHistoryItem = useCallback((id: string, updates: Partial<HistoryItem>) => {
        setHistory(prev => prev.map(item =>
            item.id === id ? { ...item, ...updates } : item
        ));
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
        setStorageWarning(null);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        history,
        addToHistory,
        updateHistoryItem,
        deleteItem,
        clearHistory,
        storageWarning
    };
}

