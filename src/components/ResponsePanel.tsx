'use client';

import { useState, useCallback } from 'react';
import { ModelResponse, Model } from '@/types';
import { ResponseCard } from './ResponseCard';

interface ResponsePanelProps {
    responses: ModelResponse[];
    models: Model[];
}

export function ResponsePanel({ responses, models }: ResponsePanelProps) {
    const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

    if (responses.length === 0) {
        return null;
    }

    const toggleExpand = useCallback((modelId: string) => {
        setExpandedModels(prev => {
            const next = new Set(prev);
            if (next.has(modelId)) {
                next.delete(modelId);
            } else {
                next.add(modelId);
            }
            return next;
        });
    }, []);

    const getModelName = (modelId: string): string => {
        const model = models.find(m => m.id === modelId);
        return model?.name || modelId.split('/').pop() || modelId;
    };

    return (
        <div className="response-panel">
            <h3 className="response-panel-title">Model Responses</h3>
            <div className="response-cards">
                {responses.map((response) => (
                    <ResponseCard
                        key={response.modelId}
                        response={response}
                        modelName={getModelName(response.modelId)}
                        isExpanded={expandedModels.has(response.modelId)}
                        onToggle={toggleExpand}
                    />
                ))}
            </div>
        </div>
    );
}
