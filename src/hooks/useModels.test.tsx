import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useModels } from './useModels';
import { FALLBACK_MODELS, Model } from '@/types';

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

describe('validateUserSelectedModels', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        mockLocalStorage.getItem.mockReturnValue(null);
        mockLocalStorage.setItem.mockClear();
    });

    const mockLiveModels: Model[] = [
        { id: 'model-a', name: 'Model A', provider: 'Provider1', description: 'desc' },
        { id: 'model-b', name: 'Model B', provider: 'Provider1', description: 'desc' },
        { id: 'model-c', name: 'Model C', provider: 'Provider2', description: 'desc' },
    ];

    it('should validate selected models and return valid ones', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        const selectedModels = ['model-a', 'model-b'];
        const { validModels, removedModels } = result.current.validateUserSelectedModels(
            selectedModels,
            mockLiveModels
        );

        expect(validModels).toEqual(['model-a', 'model-b']);
        expect(removedModels).toEqual([]);
    });

    it('should identify invalid models that are not available', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        const selectedModels = ['model-a', 'invalid-model', 'model-c'];
        const { validModels, removedModels } = result.current.validateUserSelectedModels(
            selectedModels,
            mockLiveModels
        );

        expect(validModels).toEqual(['model-a', 'model-c']);
        expect(removedModels).toEqual([
            { modelId: 'invalid-model', reason: 'unavailable' }
        ]);
    });

    it('should handle all models being invalid', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        const selectedModels = ['invalid-1', 'invalid-2'];
        const { validModels, removedModels } = result.current.validateUserSelectedModels(
            selectedModels,
            mockLiveModels
        );

        // Should fallback to first available model as per validateSelectedModels logic
        expect(validModels).toEqual(['model-a']);
        expect(removedModels).toEqual([
            { modelId: 'invalid-1', reason: 'unavailable' },
            { modelId: 'invalid-2', reason: 'unavailable' }
        ]);
    });

    it('should handle empty selected models array', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        const selectedModels: string[] = [];
        const { validModels, removedModels } = result.current.validateUserSelectedModels(
            selectedModels,
            mockLiveModels
        );

        // Should fallback to defaults that are available, or first available
        expect(validModels.length).toBeGreaterThan(0);
        expect(removedModels).toEqual([]);
    });

    it('should return multiple removed models with correct info', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        const selectedModels = ['gone-1', 'model-a', 'gone-2', 'gone-3'];
        const { validModels, removedModels } = result.current.validateUserSelectedModels(
            selectedModels,
            mockLiveModels
        );

        expect(validModels).toEqual(['model-a']);
        expect(removedModels).toHaveLength(3);
        expect(removedModels).toEqual([
            { modelId: 'gone-1', reason: 'unavailable' },
            { modelId: 'gone-2', reason: 'unavailable' },
            { modelId: 'gone-3', reason: 'unavailable' }
        ]);
    });
});

describe('Removed Models Warning', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        mockLocalStorage.getItem.mockReturnValue(null);
        mockLocalStorage.setItem.mockClear();
    });

    it('should initially have no removed models warning', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        expect(result.current.removedSelectedModels).toEqual([]);
        expect(result.current.removedModelsWarning).toBeNull();
    });

    it('should update removedSelectedModels via setRemovedSelectedModels', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        act(() => {
            result.current.setRemovedSelectedModels([
                { modelId: 'test-model', reason: 'unavailable' }
            ]);
        });

        expect(result.current.removedSelectedModels).toEqual([
            { modelId: 'test-model', reason: 'unavailable' }
        ]);
        expect(result.current.removedModelsWarning).toContain('test-model');
    });

    it('should generate correct warning message for single removed model', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        act(() => {
            result.current.setRemovedSelectedModels([
                { modelId: 'anthropic/claude-removed', reason: 'unavailable' }
            ]);
        });

        expect(result.current.removedModelsWarning).toBe(
            'The following models were removed from your selection (no longer available): anthropic/claude-removed'
        );
    });

    it('should generate correct warning message for multiple removed models', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        act(() => {
            result.current.setRemovedSelectedModels([
                { modelId: 'model-1', reason: 'unavailable' },
                { modelId: 'model-2', reason: 'unavailable' },
                { modelId: 'model-3', reason: 'unavailable' }
            ]);
        });

        expect(result.current.removedModelsWarning).toBe(
            'The following models were removed from your selection (no longer available): model-1, model-2, model-3'
        );
    });

    it('should dismiss warning via dismissRemovedModelsWarning', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        // Set some removed models
        act(() => {
            result.current.setRemovedSelectedModels([
                { modelId: 'removed-model', reason: 'unavailable' }
            ]);
        });

        expect(result.current.removedModelsWarning).not.toBeNull();

        // Dismiss the warning
        act(() => {
            result.current.dismissRemovedModelsWarning();
        });

        expect(result.current.removedSelectedModels).toEqual([]);
        expect(result.current.removedModelsWarning).toBeNull();
    });

    it('should reset validation state via resetValidationState', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        // Set validation done and some removed models
        result.current.validationDoneRef.current = true;
        act(() => {
            result.current.setRemovedSelectedModels([
                { modelId: 'removed-model', reason: 'unavailable' }
            ]);
        });

        expect(result.current.validationDoneRef.current).toBe(true);
        expect(result.current.removedModelsWarning).not.toBeNull();

        // Reset validation state
        act(() => {
            result.current.resetValidationState();
        });

        expect(result.current.validationDoneRef.current).toBe(false);
        expect(result.current.removedSelectedModels).toEqual([]);
        expect(result.current.removedModelsWarning).toBeNull();
    });
});

describe('Validation State', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        mockLocalStorage.getItem.mockReturnValue(null);
        mockLocalStorage.setItem.mockClear();
    });

    it('should initially have isValidating as false', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        expect(result.current.isValidating).toBe(false);
    });

    it('should allow setting isValidating state', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        act(() => {
            result.current.setIsValidating(true);
        });

        expect(result.current.isValidating).toBe(true);

        act(() => {
            result.current.setIsValidating(false);
        });

        expect(result.current.isValidating).toBe(false);
    });

    it('should track validation done state via ref', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { }));

        const { result } = renderHook(() => useModels());

        expect(result.current.validationDoneRef.current).toBe(false);

        // Manually set as would happen in page.tsx
        result.current.validationDoneRef.current = true;

        expect(result.current.validationDoneRef.current).toBe(true);
    });
});
