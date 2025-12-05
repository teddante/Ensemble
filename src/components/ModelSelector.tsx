'use client';

import { Check } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { DEFAULT_MODELS } from '@/types';

export function ModelSelector() {
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

    return (
        <div className="model-selector">
            <div className="model-selector-header">
                <h3>Select Models</h3>
                <span className="model-count">
                    {settings.selectedModels.length} selected
                </span>
            </div>
            <div className="model-chips">
                {DEFAULT_MODELS.map((model) => {
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
