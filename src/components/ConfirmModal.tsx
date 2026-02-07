'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { BaseModal } from './BaseModal';
import { ICON_SIZE } from '@/lib/constants';

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
    const id = useId();
    const titleId = `${id}-title`;
    const messageId = `${id}-message`;
    const confirmButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isOpen && confirmButtonRef.current) {
            confirmButtonRef.current.focus();
        }
    }, [isOpen]);

    const getVariantColor = () => {
        switch (variant) {
            case 'danger':
                return 'var(--color-error)';
            case 'warning':
                return 'var(--color-warning)';
            case 'info':
            default:
                return 'var(--color-accent-primary)';
        }
    };

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onCancel}
            overlayStyle={{ zIndex: 1001 }}
            contentStyle={{ maxWidth: '400px', textAlign: 'center' }}
            role="alertdialog"
            ariaLabelledBy={titleId}
            ariaDescribedBy={messageId}
        >
                <div className="modal-header confirm-modal-header">
                    <div className="confirm-icon-container" style={{
                        backgroundColor: `${getVariantColor()}20`,
                    }}>
                        <AlertTriangle size={ICON_SIZE.xl} style={{ color: getVariantColor() }} />
                    </div>
                    <h2 id={titleId} className="confirm-modal-title">{title}</h2>
                </div>

                <div className="modal-body confirm-modal-body">
                    <p id={messageId} className="confirm-modal-message">
                        {message}
                    </p>
                </div>

                <div className="modal-footer confirm-modal-footer">
                    <button className="button-secondary" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button
                        ref={confirmButtonRef}
                        className="button-primary"
                        onClick={onConfirm}
                        style={variant === 'danger' ? { backgroundColor: 'var(--color-error)' } : undefined}
                    >
                        {confirmText}
                    </button>
                </div>
        </BaseModal>
    );
}
