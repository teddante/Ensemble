'use client';

import { Sparkles, Loader2 } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CopyButton } from './CopyButton';
import { ICON_SIZE } from '@/lib/constants';

interface SynthesizedResponseProps {
    content: string;
    isStreaming: boolean;
    isGenerating: boolean;
    truncatedModels?: string[];
}

export function SynthesizedResponse({ content, isStreaming, isGenerating, truncatedModels = [] }: SynthesizedResponseProps) {
    if (!content && !isGenerating) {
        return null;
    }

    return (
        <div className="synthesized-response">
            <div className="synthesized-header">
                <div className="synthesized-title">
                    <Sparkles size={ICON_SIZE.lg} className="sparkle-icon" />
                    <h3>Synthesized Response</h3>
                    {isStreaming && (
                        <span className="streaming-badge">
                            <Loader2 size={ICON_SIZE.sm} className="spin" />
                            Synthesizing...
                        </span>
                    )}
                </div>
                {content && !isStreaming && (
                    <CopyButton content={content} label="Copy" />
                )}
            </div>

            {truncatedModels.length > 0 && (
                <div className="prompt-warning warning-caution" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.9rem',
                }}>
                    <span>⚠️</span>
                    <span>
                        Input from {truncatedModels.length} model{truncatedModels.length > 1 ? 's' : ''}
                        ({truncatedModels.join(', ')}) was truncated to prevent context overflow.
                        Synthesis may be less accurate.
                    </span>
                </div>
            )}

            <div className="synthesized-content">
                {content ? (
                    <MarkdownRenderer content={content} />
                ) : isGenerating ? (
                    <div className="synthesized-placeholder">
                        <Loader2 size={ICON_SIZE.xl} className="spin" />
                        <span>Waiting for model responses...</span>
                    </div>
                ) : null}
                {isStreaming && <span className="cursor-blink">▊</span>}
            </div>
        </div>
    );
}
