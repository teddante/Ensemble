'use client';

import React, { memo } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, Info } from 'lucide-react';
import { ModelResponse, Message } from '@/types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ICON_SIZE } from '@/lib/constants';

const STATUS_CONFIG: Record<ModelResponse['status'], { icon: React.ReactNode; label: string }> = {
    pending: { icon: <Loader2 size={ICON_SIZE.md} className="spin status-pending" />, label: 'Waiting...' },
    streaming: { icon: <Loader2 size={ICON_SIZE.md} className="spin status-streaming" />, label: 'Streaming...' },
    complete: { icon: <CheckCircle size={ICON_SIZE.md} className="status-complete" />, label: 'Complete' },
    error: { icon: <XCircle size={ICON_SIZE.md} className="status-error" />, label: 'Error' },
};

interface ResponseCardProps {
    response: ModelResponse;
    modelName: string;
    isExpanded: boolean;
    onToggle: (modelId: string) => void;
    onInspect?: (data: { messages: Message[]; modelId: string }) => void;
}

const ResponseCard = memo(function ResponseCard({
    response,
    modelName,
    isExpanded,
    onToggle,
    onInspect
}: ResponseCardProps) {
    const { icon: statusIcon, label: statusLabel } = STATUS_CONFIG[response.status];

    return (
        <div className={`response-card ${response.status}`}>
            <button
                className="response-card-header"
                onClick={() => onToggle(response.modelId)}
                aria-expanded={isExpanded}
            >
                <div className="response-card-info">
                    <span className="response-model-name">
                        {modelName}
                    </span>
                    <div className="response-status-group">
                        {(response.wordCount !== undefined || response.tokens !== undefined) && (
                            <span className="response-tokens">
                                {response.wordCount !== undefined ? response.wordCount : response.tokens} words
                            </span>
                        )}
                        <span className={`response-status ${response.status}`}>
                            {statusIcon}
                            {statusLabel}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {onInspect && response.promptData && (
                        <div
                            role="button"
                            tabIndex={0}
                            className="p-1 text-text-tertiary hover:text-text-primary rounded z-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                onInspect(response.promptData!);
                            }}
                            title="Inspect Prompt"
                        >
                            <Info size={ICON_SIZE.md} />
                        </div>
                    )}
                    {(response.status === 'complete' || response.status === 'error') && (
                        <span className="expand-icon">
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </span>
                    )}
                </div>
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
}, (prevProps, nextProps) => {
    // Custom comparison function for performance
    return (
        prevProps.isExpanded === nextProps.isExpanded &&
        prevProps.response === nextProps.response && // Relies on immutable updates in parent
        prevProps.modelName === nextProps.modelName &&
        prevProps.onInspect === nextProps.onInspect
    );
});

export { ResponseCard };
