'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface PromptInputProps {
    onSubmit: (prompt: string) => void;
    isLoading: boolean;
    disabled: boolean;
}

export function PromptInput({ onSubmit, isLoading, disabled }: PromptInputProps) {
    const [prompt, setPrompt] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
        }
    }, [prompt]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (prompt.trim() && !isLoading && !disabled) {
            onSubmit(prompt.trim());
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const isDisabled = disabled || isLoading || !prompt.trim();

    return (
        <form onSubmit={handleSubmit} className="prompt-form">
            <div className="prompt-input-container">
                <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything... Get synthesized insights from multiple AI models"
                    className="prompt-textarea"
                    disabled={isLoading}
                    rows={1}
                />
                <div className="prompt-actions">
                    <span className="char-count">{prompt.length.toLocaleString()} chars</span>
                    <button
                        type="submit"
                        className="submit-button"
                        disabled={isDisabled}
                        aria-label="Generate response"
                    >
                        {isLoading ? (
                            <Loader2 size={20} className="spin" />
                        ) : (
                            <Send size={20} />
                        )}
                        <span>{isLoading ? 'Generating...' : 'Generate'}</span>
                    </button>
                </div>
            </div>
            {disabled && (
                <p className="prompt-warning">
                    Please configure your OpenRouter API key in Settings to continue.
                </p>
            )}
        </form>
    );
}
