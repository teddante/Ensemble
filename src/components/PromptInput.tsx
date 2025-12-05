'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, X } from 'lucide-react';

interface PromptInputProps {
    onSubmit: (prompt: string) => void;
    onCancel?: () => void;
    isLoading: boolean;
    disabled: boolean;
    initialValue?: string;
}

export function PromptInput({ onSubmit, onCancel, isLoading, disabled, initialValue = '' }: PromptInputProps) {
    const [prompt, setPrompt] = useState(initialValue);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Sync prompt with initialValue when it changes (e.g. loading from history)
    useEffect(() => {
        if (initialValue) {
            setPrompt(initialValue);
        }
    }, [initialValue]);

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

    const handleCancel = () => {
        if (onCancel) {
            onCancel();
        }
    };

    const isDisabled = disabled || !prompt.trim();

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
                    aria-label="Prompt input"
                />
                <div className="prompt-actions">
                    <span className="char-count">{prompt.length.toLocaleString()} chars</span>
                    {isLoading ? (
                        <button
                            type="button"
                            className="cancel-button"
                            onClick={handleCancel}
                            aria-label="Cancel generation"
                        >
                            <X size={20} />
                            <span>Cancel</span>
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="submit-button"
                            disabled={isDisabled}
                            aria-label="Generate response"
                        >
                            <Send size={20} />
                            <span>Generate</span>
                        </button>
                    )}
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

