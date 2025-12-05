'use client';

import { X, AlertTriangle } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmModal({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    variant = 'warning',
}: ConfirmModalProps) {
    const confirmButtonRef = useRef<HTMLButtonElement>(null);

    // Focus confirm button when modal opens
    useEffect(() => {
        if (isOpen && confirmButtonRef.current) {
            confirmButtonRef.current.focus();
        }
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onCancel();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onCancel();
        }
    };

    const getVariantColor = () => {
        switch (variant) {
            case 'danger':
                return 'var(--accent-error)';
            case 'warning':
                return 'var(--accent-warning)';
            case 'info':
            default:
                return 'var(--accent-primary)';
        }
    };

    return (
        <div className="modal-overlay" onClick={handleOverlayClick} style={{ zIndex: 1001 }}>
            <div
                className="modal-content"
                style={{
                    maxWidth: '400px',
                    textAlign: 'center',
                }}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-message"
            >
                <div className="modal-header" style={{ justifyContent: 'center', borderBottom: 'none' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        backgroundColor: `${getVariantColor()}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1rem',
                    }}>
                        <AlertTriangle size={24} style={{ color: getVariantColor() }} />
                    </div>
                    <h2 id="confirm-title" style={{ width: '100%', marginBottom: '0.5rem' }}>{title}</h2>
                </div>

                <div className="modal-body" style={{ paddingTop: 0 }}>
                    <p id="confirm-message" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {message}
                    </p>
                </div>

                <div className="modal-footer" style={{ justifyContent: 'center', gap: '1rem', borderTop: 'none', paddingTop: '0.5rem' }}>
                    <button
                        className="button-secondary"
                        onClick={onCancel}
                        style={{ minWidth: '100px' }}
                    >
                        {cancelText}
                    </button>
                    <button
                        ref={confirmButtonRef}
                        className="button-primary"
                        onClick={onConfirm}
                        style={{
                            minWidth: '100px',
                            backgroundColor: variant === 'danger' ? 'var(--accent-error)' : undefined,
                        }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
