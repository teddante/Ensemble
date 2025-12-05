'use client';

import { Check } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { Model } from '@/types';

interface ModelSelectorProps {
    models: Model[];
    isLoading?: boolean;
}

export function ModelSelector({ models, isLoading }: ModelSelectorProps) {
    const { settings, updateSelectedModels } = useSettings();

    const toggleModel = (modelId: string) => {
        const isSelected = settings.selectedModels.includes(modelId);

        if (isSelected) {
            // Don't allow deselecting if it's the only one
            if (settings.selectedModels.length > 1) {
                updateSelectedModels(settings.selectedModels.filter(id => id !== modelId));
            }
        } else {
            updateSelectedModels([...settings.selectedModels, modelId]);
        }
    };

    if (isLoading) {
        return <div className="p-4 text-center">Loading models...</div>;
    }

    // Ensure we don't display selected models that aren't in the available list (unless we want to keep them)
    // For now, we trust the `models` list is comprehensive or fallback-enabled.

    return (
        <div className="model-selector">
            <div className="model-selector-header">
                <h3>Select Models</h3>
                <span className="model-count">
                    {settings.selectedModels.length} selected
                </span>
            </div>
            <div className="model-chips">
                {models.map((model) => {
                    const isSelected = settings.selectedModels.includes(model.id);
                    return (
                        <button
                            key={model.id}
                            onClick={() => toggleModel(model.id)}
                            className={`model-chip ${isSelected ? 'selected' : ''}`}
                            title={model.description}
                        >
                            {isSelected && <Check size={14} />}
                            <span className="model-name">{model.name}</span>
                            <span className="model-provider">{model.provider}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
