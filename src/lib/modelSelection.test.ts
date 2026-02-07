import { describe, it, expect } from 'vitest';
import { Model } from '@/types';
import {
    buildModelIndex,
    buildSelectedModelIdSet,
    countSelectedModelsInSet,
    resolveSelectedModelEntries,
    resolveUniqueSelectedModels,
    validateUserSelectedModels
} from './modelSelection';

const MODELS: Model[] = [
    { id: 'a/model-1', name: 'Model 1', provider: 'A', description: 'A1' },
    { id: 'b/model-2', name: 'Model 2', provider: 'B', description: 'B2' },
    { id: 'c/model-3', name: 'Model 3', provider: 'C', description: 'C3' },
];

describe('modelSelection', () => {
    it('resolveSelectedModelEntries preserves order and duplicates', () => {
        const result = resolveSelectedModelEntries(
            ['a/model-1', 'b/model-2', 'a/model-1'],
            MODELS
        );

        expect(result).toHaveLength(3);
        expect(result[0].selectionIndex).toBe(0);
        expect(result[0].model.id).toBe('a/model-1');
        expect(result[1].selectionIndex).toBe(1);
        expect(result[1].model.id).toBe('b/model-2');
        expect(result[2].selectionIndex).toBe(2);
        expect(result[2].model.id).toBe('a/model-1');
    });

    it('resolveSelectedModelEntries ignores unknown model IDs', () => {
        const result = resolveSelectedModelEntries(
            ['a/model-1', 'missing/model'],
            MODELS
        );

        expect(result).toHaveLength(1);
        expect(result[0].model.id).toBe('a/model-1');
    });

    it('resolveUniqueSelectedModels deduplicates while preserving first-selected order', () => {
        const result = resolveUniqueSelectedModels(
            ['b/model-2', 'a/model-1', 'b/model-2', 'c/model-3'],
            MODELS
        );

        expect(result.map(model => model.id)).toEqual([
            'b/model-2',
            'a/model-1',
            'c/model-3',
        ]);
    });

    it('buildModelIndex maps model IDs to model objects', () => {
        const index = buildModelIndex(MODELS);
        expect(index.get('b/model-2')?.name).toBe('Model 2');
    });

    it('buildSelectedModelIdSet removes duplicate IDs', () => {
        const selectedSet = buildSelectedModelIdSet(['a/model-1', 'a/model-1', 'b/model-2']);
        expect(selectedSet.size).toBe(2);
        expect(selectedSet.has('a/model-1')).toBe(true);
        expect(selectedSet.has('b/model-2')).toBe(true);
    });

    it('countSelectedModelsInSet counts model instances in the provided set', () => {
        const count = countSelectedModelsInSet(
            ['a/model-1', 'b/model-2', 'a/model-1', 'c/model-3'],
            new Set(['a/model-1', 'c/model-3'])
        );
        expect(count).toBe(3);
    });

    it('validateUserSelectedModels returns removed model metadata', () => {
        const result = validateUserSelectedModels(
            ['a/model-1', 'missing/model'],
            MODELS
        );

        expect(result.validModels).toEqual(['a/model-1']);
        expect(result.removedModels).toEqual([{ modelId: 'missing/model', reason: 'unavailable' }]);
    });
});
