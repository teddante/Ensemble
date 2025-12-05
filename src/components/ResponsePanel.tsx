'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { ModelResponse, Model } from '@/types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ResponsePanelProps {
    responses: ModelResponse[];
    models: Model[];
}

export function ResponsePanel({ responses, models }: ResponsePanelProps) {
    const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

    if (responses.length === 0) {
        return null;
    }

    const toggleExpand = (modelId: string) => {
        setExpandedModels(prev => {
            const next = new Set(prev);
            if (next.has(modelId)) {
                next.delete(modelId);
            } else {
                next.add(modelId);
            }
            return next;
        });
    };

    const getModelName = (modelId: string): string => {
        const model = models.find(m => m.id === modelId);
        return model?.name || modelId.split('/').pop() || modelId;
    };

    const getStatusIcon = (status: ModelResponse['status']) => {
        switch (status) {
            case 'pending':
                return <Loader2 size={16} className="spin status-pending" />;
            case 'streaming':
                return <Loader2 size={16} className="spin status-streaming" />;
            case 'complete':
                return <CheckCircle size={16} className="status-complete" />;
            case 'error':
                return <XCircle size={16} className="status-error" />;
        }
    };

    const getStatusLabel = (status: ModelResponse['status']) => {
        switch (status) {
            case 'pending':
                return 'Waiting...';
            case 'streaming':
                return 'Streaming...';
            case 'complete':
                return 'Complete';
            case 'error':
                return 'Error';
        }
    };

    return (
        <div className="response-panel">
            <h3 className="response-panel-title">Model Responses</h3>
            <div className="response-cards">
                {responses.map((response) => {
                    const isExpanded = expandedModels.has(response.modelId);
                    return (
                        <div
                            key={response.modelId}
                            className={`response-card ${response.status}`}
                        >
                            <button
                                className="response-card-header"
                                onClick={() => toggleExpand(response.modelId)}
                                aria-expanded={isExpanded}
                            >
                                <div className="response-card-info">
                                    <span className="response-model-name">
                                        {getModelName(response.modelId)}
                                    </span>
                                    <div className="response-status-group">
                                        {response.tokens && (
                                            <span className="response-tokens">
                                                {response.tokens} words
                                            </span>
                                        )}
                                        <span className={`response-status ${response.status}`}>
                                            {getStatusIcon(response.status)}
                                            {getStatusLabel(response.status)}
                                        </span>
                                    </div>
                                </div>
                                {(response.status === 'complete' || response.status === 'error') && (
                                    <span className="expand-icon">
                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </span>
                                )}
                            </button>

                            {isExpanded && response.status === 'complete' && response.content && (
                                <div className="response-card-content">
                                    <MarkdownRenderer content={response.content} />
                                </div>
                            )}

                            {isExpanded && response.status === 'error' && response.error && (
                                <div className="response-card-error">
                                    <p>{response.error}</p>
                                </div>
                            )}

                            {response.status === 'streaming' && response.content && (
                                <div className="response-card-preview">
                                    <pre>{response.content.slice(-200)}</pre>
                                    <div className="streaming-indicator" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
