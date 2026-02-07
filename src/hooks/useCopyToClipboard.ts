import { useState, useCallback } from 'react';

/**
 * Hook for copying text to clipboard with a temporary "copied" state
 */
export function useCopyToClipboard(timeout = 2000) {
    const [copied, setCopied] = useState(false);

    const copy = useCallback(async (text: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), timeout);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    }, [timeout]);

    return { copied, copy };
}
