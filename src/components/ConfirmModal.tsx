'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { BaseModal } from './BaseModal';

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
        <BaseModal
            isOpen={isOpen}
            onClose={onCancel}
            overlayStyle={{ zIndex: 1001 }}
            contentStyle={{ maxWidth: '400px', textAlign: 'center' }}
            role="alertdialog"
            ariaLabelledBy="confirm-title"
            ariaDescribedBy="confirm-message"
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
        </BaseModal>
    );
}
