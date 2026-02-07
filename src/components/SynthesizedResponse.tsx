'use client';

import { Copy, Check, Sparkles, Loader2 } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

interface SynthesizedResponseProps {
    content: string;
    isStreaming: boolean;
    isGenerating: boolean;
    truncatedModels?: string[];
}

export function SynthesizedResponse({ content, isStreaming, isGenerating, truncatedModels = [] }: SynthesizedResponseProps) {
    const { copied, copy } = useCopyToClipboard();

    if (!content && !isGenerating) {
        return null;
    }

    return (
        <div className="synthesized-response">
            <div className="synthesized-header">
                <div className="synthesized-title">
                    <Sparkles size={20} className="sparkle-icon" />
                    <h3>Synthesized Response</h3>
                    {isStreaming && (
                        <span className="streaming-badge">
                            <Loader2 size={14} className="spin" />
                            Synthesizing...
                        </span>
                    )}
                </div>
                {content && !isStreaming && (
                    <button
                        className="copy-button"
                        onClick={() => copy(content)}
                        aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
                    >
                        {copied ? (
                            <>
                                <Check size={16} />
                                <span>Copied!</span>
                            </>
                        ) : (
                            <>
                                <Copy size={16} />
                                <span>Copy</span>
                            </>
                        )}
                    </button>
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
                        <Loader2 size={24} className="spin" />
                        <span>Waiting for model responses...</span>
                    </div>
                ) : null}
                {isStreaming && <span className="cursor-blink">▊</span>}
            </div>
        </div>
    );
}
