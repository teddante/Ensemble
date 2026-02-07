'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X } from 'lucide-react';
import { ICON_SIZE } from '@/lib/constants';

interface PromptInputProps {
    onSubmit: (prompt: string) => void;
    onCancel?: () => void;
    isLoading: boolean;
    disabled: boolean;
    initialValue?: string;
}

export function PromptInput({ onSubmit, onCancel, isLoading, disabled, initialValue = '' }: PromptInputProps) {
    const [prompt, setPrompt] = useState(initialValue);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Sync prompt with initialValue when it changes (e.g. loading from history)
    useEffect(() => {
        if (initialValue && initialValue !== prompt) {
            // eslint-disable-next-line
            setPrompt(initialValue);
        }
    }, [initialValue, prompt]);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
        }
    }, [prompt]);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();

        // Prevent double-submit with debouncing
        if (isSubmitting || isLoading || disabled || !prompt.trim()) {
            return;
        }

        setIsSubmitting(true);

        // Clear any existing debounce
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        // Call onSubmit
        onSubmit(prompt.trim());
        setPrompt(''); // Clear input for next chat message

        // Reset submitting state after a short delay to prevent rapid clicks
        debounceRef.current = setTimeout(() => {
            setIsSubmitting(false);
        }, 500);
    }, [prompt, isLoading, disabled, isSubmitting, onSubmit]);

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

    const isDisabled = disabled || !prompt.trim() || isSubmitting;

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
                            <X size={ICON_SIZE.lg} />
                            <span>Cancel</span>
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="submit-button"
                            disabled={isDisabled}
                            aria-label="Generate response"
                        >
                            <Send size={ICON_SIZE.lg} />
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


