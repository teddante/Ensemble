'use client';

import { useState, useCallback } from 'react';
import { ModelResponse, Model, Message } from '@/types';
import { ResponseCard } from './ResponseCard';
import { getModelName } from '@/lib/modelUtils';
import { getResponseKey } from '@/lib/responseUtils';

interface ResponsePanelProps {
    responses: ModelResponse[];
    models: Model[];
    onInspectModel?: (data: { messages: Message[]; modelId: string }) => void;
}

export function ResponsePanel({ responses, models, onInspectModel }: ResponsePanelProps) {
    const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

    const toggleExpand = useCallback((responseKey: string) => {
        setExpandedModels(prev => {
            const next = new Set(prev);
            if (next.has(responseKey)) {
                next.delete(responseKey);
            } else {
                next.add(responseKey);
            }
            return next;
        });
    }, []);

    if (responses.length === 0) {
        return null;
    }

    return (
        <div className="response-panel">
            <h3 className="response-panel-title">Model Responses</h3>
            <div className="response-cards">
                {responses.map((response, index) => {
                    const responseKey = getResponseKey(response, index);
                    return (
                    <ResponseCard
                        key={responseKey}
                        response={response}
                        modelName={getModelName(response.modelId, models)}
                        responseKey={responseKey}
                        isExpanded={expandedModels.has(responseKey)}
                        onToggle={toggleExpand}
                        onInspect={onInspectModel}
                    />
                    );
                })}
            </div>
        </div>
    );
}
