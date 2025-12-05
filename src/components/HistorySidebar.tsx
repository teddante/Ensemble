import { Trash2, RotateCcw, X, Clock } from 'lucide-react';
import { HistoryItem } from '@/hooks/useHistory';

interface HistorySidebarProps {
    isOpen: boolean;
    onClose: () => void;
    history: HistoryItem[];
    onLoad: (item: HistoryItem) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
}

export function HistorySidebar({ isOpen, onClose, history, onLoad, onDelete, onClear }: HistorySidebarProps) {
    if (!isOpen) return null;

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
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
                                        onDelete(item.id);
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
                        <button className="history-clear" onClick={() => {
                            if (confirm('Are you sure you want to clear all history?')) {
                                onClear();
                            }
                        }}>
                            Clear All History
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
