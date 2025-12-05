'use client';

import { useState } from 'react';
import { Copy, Check, Sparkles, Loader2 } from 'lucide-react';

interface SynthesizedResponseProps {
    content: string;
    isStreaming: boolean;
    isGenerating: boolean;
}

export function SynthesizedResponse({ content, isStreaming, isGenerating }: SynthesizedResponseProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!content) return;

        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

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
                        onClick={handleCopy}
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

            <div className="synthesized-content">
                {content ? (
                    <pre>{content}</pre>
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
