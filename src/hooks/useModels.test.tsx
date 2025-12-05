import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useModels } from './useModels';
import { FALLBACK_MODELS } from '@/types';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });

describe('useModels Hook', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        mockLocalStorage.getItem.mockReturnValue(null); // No cached models
        mockLocalStorage.setItem.mockClear();
    });

    it('should return fallback models initially', async () => {
        // Delay the fetch response
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        expect(result.current.isLoading).toBe(true);
        expect(result.current.models).toEqual(FALLBACK_MODELS);
    });

    it('should update models after successful fetch', async () => {
        const mockModels = [
            { id: 'test/model', name: 'Test Model', provider: 'Test', description: 'desc' }
        ];

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ models: mockModels }),
        });

        const { result } = renderHook(() => useModels());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.models).toEqual(mockModels);
        expect(result.current.error).toBeNull();
    });

    it('should use fallback models on API error after retries', async () => {
        // Mock all 3 retry attempts to fail
        mockFetch
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'));

        const { result } = renderHook(() => useModels());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        }, { timeout: 10000 }); // Longer timeout for retries

        expect(result.current.models).toEqual(FALLBACK_MODELS);
        expect(result.current.error).toBe('Using offline models');
    });
});
