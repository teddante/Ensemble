'use client';

import { useState } from 'react';
import { Trash2, X, Clock } from 'lucide-react';
import { HistoryItem } from '@/hooks/useHistory';
import { ConfirmModal } from './ConfirmModal';

interface HistorySidebarProps {
    isOpen: boolean;
    onClose: () => void;
    history: HistoryItem[];
    onLoad: (item: HistoryItem) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
}

export function HistorySidebar({ isOpen, onClose, history, onLoad, onDelete, onClear }: HistorySidebarProps) {
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    if (!isOpen) return null;

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleClearConfirm = () => {
        onClear();
        setShowClearConfirm(false);
    };

    const handleDeleteConfirm = () => {
        if (deleteConfirmId) {
            onDelete(deleteConfirmId);
            setDeleteConfirmId(null);
        }
    };

    return (
        <>
            <div className="history-overlay" onClick={onClose} />
            <div className={`history-sidebar ${isOpen ? 'open' : ''}`}>
                <div className="history-header">
                    <div className="history-title">
                        <Clock size={20} />
                        <h3>History</h3>
                    </div>
                    <button className="history-close" onClick={onClose} aria-label="Close history">
                        <X size={20} />
                    </button>
                </div>

                <div className="history-list">
                    {history.length === 0 ? (
                        <div className="history-empty">
                            <Clock size={40} />
                            <p>No history yet</p>
                        </div>
                    ) : (
                        history.map((item) => (
                            <div key={item.id} className="history-item">
                                <div className="history-item-content" onClick={() => onLoad(item)}>
                                    <p className="history-prompt">{item.prompt}</p>
                                    <div className="history-meta">
                                        <span>{formatDate(item.timestamp)}</span>
                                        <span className="history-models">
                                            {item.models.length} models
                                        </span>
                                    </div>
                                </div>
                                <button
                                    className="history-delete"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirmId(item.id);
                                    }}
                                    aria-label="Delete item"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {history.length > 0 && (
                    <div className="history-footer">
                        <button
                            className="history-clear"
                            onClick={() => setShowClearConfirm(true)}
                        >
                            Clear All History
                        </button>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={showClearConfirm}
                title="Clear All History"
                message="This will permanently delete all your conversation history. This action cannot be undone."
                confirmText="Clear All"
                cancelText="Keep History"
                onConfirm={handleClearConfirm}
                onCancel={() => setShowClearConfirm(false)}
                variant="danger"
            />

            <ConfirmModal
                isOpen={deleteConfirmId !== null}
                title="Delete Item"
                message="Are you sure you want to delete this history item?"
                confirmText="Delete"
                cancelText="Cancel"
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteConfirmId(null)}
                variant="warning"
            />
        </>
    );
}

