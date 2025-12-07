import { memo } from 'react';
import { ModelResponse, Model } from '@/types';
import { SynthesizedResponse } from './SynthesizedResponse';
import { ResponsePanel } from './ResponsePanel';
import { User, Sparkles, Info } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatMessageProps {
    role: 'user' | 'assistant';
    content: string;
    responses?: ModelResponse[];
    models?: Model[];
    isStreaming?: boolean;
    isGenerating?: boolean;
    timestamp?: number;
    truncatedModels?: string[];
    onInspectPrompt?: (data: { messages: any[]; modelId: string }) => void;
    synthesisPromptData?: { messages: any[]; modelId: string };
}

export const ChatMessage = memo(function ChatMessage({
    role,
    content,
    responses,
    models,
    isStreaming,
    isGenerating,
    truncatedModels,
    onInspectPrompt,
    synthesisPromptData
}: ChatMessageProps) {

    if (role === 'user') {
        return (
            <div className="chat-message user-message">
                <div className="message-content user-content">
                    <MarkdownRenderer content={content} forceNewlines={true} />
                </div>
                <div className="message-avatar user-avatar">
                    <User size={20} />
                </div>
            </div>
        );
    }

    return (
        <div className="chat-message assistant-message">
            <div className="message-avatar assistant-avatar">
                <Sparkles size={20} />
            </div>
            <div className="message-content assistant-content">
                <div className="flex items-center gap-2 mb-1">
                    <div className="assistant-name">Ensemble AI</div>
                    {onInspectPrompt && synthesisPromptData && (
                        <button
                            onClick={() => onInspectPrompt(synthesisPromptData)}
                            className="text-text-tertiary hover:text-text-primary p-1 rounded hover:bg-surface-tertiary transition-colors"
                            title="Inspect Synthesis Prompt"
                        >
                            <Info size={14} />
                        </button>
                    )}
                </div>
                <SynthesizedResponse
                    content={content}
                    isStreaming={!!isStreaming}
                    isGenerating={!!isGenerating}
                    truncatedModels={truncatedModels}
                />
                {responses && models && responses.length > 0 && (
                    <div className="model-breakdown-container">
                        <details className="model-breakdown-details">
                            <summary className="model-breakdown-summary">
                                View Individual Model Responses ({responses.length})
                            </summary>
                            <div className="model-breakdown-content">
                                <ResponsePanel responses={responses} models={models} onInspectModel={onInspectPrompt} />
                            </div>
                        </details>
                    </div>
                )}
            </div>
        </div>
    );
});
