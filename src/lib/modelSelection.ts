import { Model, validateSelectedModels } from '@/types';

export interface SelectedModelEntry {
    selectionIndex: number;
    model: Model;
}

export interface RemovedModelInfo {
    modelId: string;
    reason: 'unavailable';
}

/**
 * Resolves selected model IDs to model instances while preserving selection order and duplicates.
 * Unknown model IDs are ignored.
 */
export function resolveSelectedModelEntries(selectedModelIds: string[], models: Model[]): SelectedModelEntry[] {
    const modelById = buildModelIndex(models);

    return selectedModelIds
        .map((id, selectionIndex) => {
            const model = modelById.get(id);
            return model ? { selectionIndex, model } : null;
        })
        .filter((entry): entry is SelectedModelEntry => entry !== null);
}

/**
 * Resolves selected model IDs to unique model objects in first-selected order.
 * Unknown model IDs are ignored.
 */
export function resolveUniqueSelectedModels(selectedModelIds: string[], models: Model[]): Model[] {
    const modelById = buildModelIndex(models);
    const seen = new Set<string>();
    const uniqueSelectedModels: Model[] = [];

    for (const id of selectedModelIds) {
        if (seen.has(id)) {
            continue;
        }

        const model = modelById.get(id);
        if (!model) {
            continue;
        }

        seen.add(id);
        uniqueSelectedModels.push(model);
    }

    return uniqueSelectedModels;
}

/**
 * Builds a reusable model lookup map keyed by model ID.
 */
export function buildModelIndex(models: Model[]): Map<string, Model> {
    return new Map(models.map(model => [model.id, model]));
}

/**
 * Returns IDs selected at least once (useful for fast membership checks).
 */
export function buildSelectedModelIdSet(selectedModelIds: string[]): Set<string> {
    return new Set(selectedModelIds);
}

/**
 * Counts how many selected model instances belong to a provider/group.
 */
export function countSelectedModelsInSet(selectedModelIds: string[], modelIdSet: Set<string>): number {
    let count = 0;
    for (const id of selectedModelIds) {
        if (modelIdSet.has(id)) {
            count += 1;
        }
    }
    return count;
}

/**
 * Validates selected IDs and provides removed-model metadata for UI messaging.
 */
export function validateUserSelectedModels(
    selectedModelIds: string[],
    availableModels: Model[]
): { validModels: string[]; removedModels: RemovedModelInfo[] } {
    const { validModels, invalidModels } = validateSelectedModels(selectedModelIds, availableModels);

    return {
        validModels,
        removedModels: invalidModels.map(modelId => ({ modelId, reason: 'unavailable' })),
    };
}
