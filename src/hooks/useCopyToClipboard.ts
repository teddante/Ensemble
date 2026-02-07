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

/**
 * Hook for copying text to clipboard with per-key "copied" tracking.
 * Useful when multiple copy buttons exist (e.g., per-message in a list).
 */
export function useCopyToClipboardMap<K = number>(timeout = 2000) {
    const [copiedKey, setCopiedKey] = useState<K | null>(null);

    const copy = useCallback(async (text: string, key: K) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), timeout);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    }, [timeout]);

    const isCopied = useCallback((key: K) => copiedKey === key, [copiedKey]);

    return { copiedKey, copy, isCopied };
}
