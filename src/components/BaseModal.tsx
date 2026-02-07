'use client';

import { ReactNode, useRef } from 'react';
import { useBackdropDismiss, useEscapeDismiss, useFocusTrap } from '@/hooks/useModalDismiss';

interface BaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    /** Override className for modal-overlay div */
    overlayClassName?: string;
    /** Override className for modal-content div */
    contentClassName?: string;
    /** Inline styles for modal-content div */
    contentStyle?: React.CSSProperties;
    /** Inline styles for modal-overlay div */
    overlayStyle?: React.CSSProperties;
    /** Disable backdrop dismiss (e.g. while saving) */
    preventClose?: boolean;
    /** ARIA role override (default: "dialog") */
    role?: string;
    /** ARIA props */
    ariaLabelledBy?: string;
    ariaDescribedBy?: string;
}

export function BaseModal({
    isOpen,
    onClose,
    children,
    overlayClassName,
    contentClassName,
    contentStyle,
    overlayStyle,
    preventClose = false,
    role = 'dialog',
    ariaLabelledBy,
    ariaDescribedBy,
}: BaseModalProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const handleOverlayClick = useBackdropDismiss<HTMLDivElement>(onClose, preventClose);
    useEscapeDismiss({ enabled: isOpen && !preventClose, onDismiss: onClose });
    useFocusTrap(contentRef, isOpen);

    if (!isOpen) return null;

    return (
        <div className={overlayClassName || 'modal-overlay'} onClick={handleOverlayClick} style={overlayStyle}>
            <div
                ref={contentRef}
                className={contentClassName || 'modal-content'}
                style={contentStyle}
                role={role}
                aria-modal="true"
                aria-labelledby={ariaLabelledBy}
                aria-describedby={ariaDescribedBy}
            >
                {children}
            </div>
        </div>
    );
}
