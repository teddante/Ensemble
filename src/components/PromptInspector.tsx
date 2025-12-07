import React from 'react';
import { Message } from '@/types';
import { X, Copy, Check, Download } from 'lucide-react';

interface PromptInspectorProps {
    isOpen: boolean;
    onClose: () => void;
    messages: Message[];
    modelId: string;
}

export function PromptInspector({ isOpen, onClose, messages, modelId }: PromptInspectorProps) {
    const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
    const [copiedAll, setCopiedAll] = React.useState(false);
    const modalRef = React.useRef<HTMLDivElement>(null);

    // Handle Escape key
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Focus modal on open
    React.useEffect(() => {
        if (isOpen && modalRef.current) {
            modalRef.current.focus();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleCopy = async (content: string, index: number) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    const handleCopyAll = async () => {
        try {
            const allContent = messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');
            await navigator.clipboard.writeText(allContent);
            setCopiedAll(true);
            setTimeout(() => setCopiedAll(false), 2000);
        } catch (err) {
            console.error('Failed to copy all text: ', err);
        }
    };

    const handleDownloadJSON = () => {
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ modelId, messages }, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `prompt-${modelId}-${new Date().toISOString()}.json`);
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } catch (err) {
            console.error('Failed to download JSON:', err);
        }
    };

    // Handle backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={handleBackdropClick}
        >
            <div
                ref={modalRef}
                tabIndex={-1}
                className="bg-background-secondary border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col outline-none"
                role="dialog"
                aria-modal="true"
                aria-labelledby="prompt-inspector-title"
            >
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex-1 min-w-0 mr-4">
                        <h2 id="prompt-inspector-title" className="text-lg font-semibold text-text-primary">
                            Prompt Inspector
                        </h2>
                        <p className="text-sm text-text-tertiary truncate">
                            Model: <span className="font-mono text-xs bg-surface-tertiary px-1.5 py-0.5 rounded" title={modelId}>{modelId}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopyAll}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-tertiary hover:bg-surface-elevated border border-border rounded-lg transition-colors"
                            title="Copy all messages"
                        >
                            {copiedAll ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                            Copy All
                        </button>
                        <button
                            onClick={handleDownloadJSON}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-tertiary hover:bg-surface-elevated border border-border rounded-lg transition-colors"
                            title="Download as JSON"
                        >
                            <Download size={14} />
                            JSON
                        </button>
                        <div className="w-px h-6 bg-border mx-1" />
                        <button
                            onClick={onClose}
                            className="p-2 text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary rounded-lg transition-colors"
                            aria-label="Close inspector"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface-primary">
                            <div className="flex items-center justify-between">
                                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${msg.role === 'system' ? 'bg-purple-500/10 text-purple-400' :
                                    msg.role === 'user' ? 'bg-blue-500/10 text-blue-400' :
                                        'bg-green-500/10 text-green-400'
                                    }`}>
                                    {msg.role}
                                </span>
                                <button
                                    onClick={() => handleCopy(msg.content, index)}
                                    className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary rounded transition-colors"
                                    title="Copy content"
                                >
                                    {copiedIndex === index ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                </button>
                            </div>
                            <div className="text-sm font-mono whitespace-pre-wrap text-text-secondary leading-relaxed bg-surface-secondary/50 p-2 rounded">
                                {msg.content}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
