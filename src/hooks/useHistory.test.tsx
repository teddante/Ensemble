import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from './useHistory';

describe('useHistory Hook', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('should start with empty history', () => {
        const { result } = renderHook(() => useHistory());
        expect(result.current.history).toEqual([]);
    });

    it('should add item to history', () => {
        const { result } = renderHook(() => useHistory());

        act(() => {
            result.current.addToHistory(
                'Test Prompt',
                ['model-1'],
                'refine-model',
                [],
                'Synthesized content'
            );
        });

        expect(result.current.history).toHaveLength(1);
        expect(result.current.history[0].prompt).toBe('Test Prompt');
    });

    it('should delete item from history', () => {
        const { result } = renderHook(() => useHistory());

        act(() => {
            result.current.addToHistory('Prompt 1', [], '', [], '');
        });

        const id = result.current.history[0].id;

        act(() => {
            result.current.deleteItem(id);
        });

        expect(result.current.history).toHaveLength(0);
    });

    it('should clear all history', () => {
        const { result } = renderHook(() => useHistory());

        act(() => {
            result.current.addToHistory('Prompt 1', [], '', [], '');
        });

        act(() => {
            result.current.addToHistory('Prompt 2', [], '', [], '');
        });

        expect(result.current.history).toHaveLength(2);

        act(() => {
            result.current.clearHistory();
        });

        expect(result.current.history).toHaveLength(0);
    });
});
