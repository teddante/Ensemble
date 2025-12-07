import React from 'react';
import { Message } from '@/types';
import { X, Copy, Check } from 'lucide-react';

interface PromptInspectorProps {
    isOpen: boolean;
    onClose: () => void;
    messages: Message[];
    modelId: string;
}

export function PromptInspector({ isOpen, onClose, messages, modelId }: PromptInspectorProps) {
    const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-background-secondary border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
                role="dialog"
                aria-modal="true"
                aria-labelledby="prompt-inspector-title"
            >
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div>
                        <h2 id="prompt-inspector-title" className="text-lg font-semibold text-text-primary">
                            Prompt Inspector
                        </h2>
                        <p className="text-sm text-text-tertiary">
                            Model: <span className="font-mono text-xs bg-surface-tertiary px-1.5 py-0.5 rounded">{modelId}</span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary rounded-lg transition-colors"
                        aria-label="Close inspector"
                    >
                        <X size={20} />
                    </button>
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
