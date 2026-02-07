import { MouseEvent, useCallback, useEffect } from 'react';

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

        eventTarget.addEventListener('keydown', handleKeyDown);
        return () => eventTarget.removeEventListener('keydown', handleKeyDown);
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
