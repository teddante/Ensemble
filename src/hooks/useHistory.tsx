'use client';

import { useState, useEffect, useCallback } from 'react';
import { ModelResponse } from '@/types';
import { v4 as uuidv4 } from 'uuid';

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
const MAX_HISTORY_ITEMS = 50;

export function useHistory() {
    const [history, setHistory] = useState<HistoryItem[]>([]);

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

    const saveToLocalStorage = (items: HistoryItem[]) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (error) {
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                // Trim oldest items and retry
                console.warn('localStorage quota exceeded, trimming history');
                const trimmed = items.slice(0, Math.floor(items.length / 2));
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
                    // Update state with trimmed items
                    setHistory(trimmed);
                } catch {
                    // If still failing, clear history
                    console.error('Failed to save history even after trimming, clearing');
                    localStorage.removeItem(STORAGE_KEY);
                    setHistory([]);
                }
            } else {
                console.error('Failed to save history:', error);
            }
        }
    };

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
            saveToLocalStorage(newHistory);
            return newHistory;
        });
    }, []);

    const deleteItem = useCallback((id: string) => {
        setHistory(prev => {
            const newHistory = prev.filter(item => item.id !== id);
            saveToLocalStorage(newHistory);
            return newHistory;
        });
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        history,
        addToHistory,
        deleteItem,
        clearHistory
    };
}
