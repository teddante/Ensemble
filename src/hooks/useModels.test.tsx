import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useModels } from './useModels';
import { FALLBACK_MODELS } from '@/types';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useModels Hook', () => {
    beforeEach(() => {
        mockFetch.mockReset();
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

    it('should use fallback models on API error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const { result } = renderHook(() => useModels());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.models).toEqual(FALLBACK_MODELS);
        expect(result.current.error).toBe('Using offline models');
    });
});
