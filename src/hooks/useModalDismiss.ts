import { MouseEvent, RefObject, useCallback, useEffect, useRef } from 'react';

type DismissTarget = 'window' | 'document';

interface EscapeDismissOptions {
    enabled: boolean;
    onDismiss: () => void;
    target?: DismissTarget;
}

export function useEscapeDismiss({
    enabled,
    onDismiss,
    target = 'window',
}: EscapeDismissOptions): void {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        const eventTarget = target === 'document' ? document : window;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onDismiss();
            }
        };

        eventTarget.addEventListener('keydown', handleKeyDown as EventListener);
        return () => eventTarget.removeEventListener('keydown', handleKeyDown as EventListener);
    }, [enabled, onDismiss, target]);
}

export function useBackdropDismiss<T extends HTMLElement>(
    onDismiss: () => void,
    disabled = false
) {
    return useCallback((event: MouseEvent<T>) => {
        if (!disabled && event.target === event.currentTarget) {
            onDismiss();
        }
    }, [onDismiss, disabled]);
}

const FOCUSABLE_SELECTOR = 'a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, enabled: boolean): void {
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!enabled || !containerRef.current) return;

        previousFocusRef.current = document.activeElement as HTMLElement;

        const focusables = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        focusables[0]?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab' || !containerRef.current) return;

            const currentFocusables = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
            if (currentFocusables.length === 0) return;

            const first = currentFocusables[0];
            const last = currentFocusables[currentFocusables.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previousFocusRef.current?.focus();
        };
    }, [enabled, containerRef]);
}
