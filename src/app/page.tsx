'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Header } from '@/components/Header';
import { SettingsModal } from '@/components/SettingsModal';
import { PromptInput } from '@/components/PromptInput';
import { ModelSelector } from '@/components/ModelSelector';
import { ChatMessage } from '@/components/ChatMessage';
import { PromptInspector } from '@/components/PromptInspector';
import { HistorySidebar } from '@/components/HistorySidebar';
import { useModels } from '@/hooks/useModels';
import { useSettings } from '@/hooks/useSettings';
import { useHistory, HistoryItem } from '@/hooks/useHistory';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useGeneration } from '@/hooks/useGeneration';
import { Message } from '@/types';
import { buildModelIndex } from '@/lib/modelSelection';

export default function Home() {
  const { settings, hasApiKey, updateSelectedModels } = useSettings();
  const {
    models,
    isLoading: isLoadingModels,
    isValidating,
    setIsValidating,
    removedModelsWarning,
    dismissRemovedModelsWarning,
    setRemovedSelectedModels,
    validateUserSelectedModels,
    validationDoneRef
  } = useModels();
  const { history, addToHistory, deleteItem, clearHistory, updateHistoryItem, storageWarning } = useHistory();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [inspectingPrompt, setInspectingPrompt] = useState<{ messages: Message[], modelId: string } | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => uuidv4());

  const modelById = useMemo(() => buildModelIndex(models), [models]);
  const { messagesEndRef, scrollToBottom, forceScrollToBottom } = useAutoScroll();

  const {
    prompt,
    isGenerating,
    isSynthesizing,
    responses,
    synthesizedContent,
    truncatedModels,
    warnings,
    error,
    synthesisPromptData,
    generate,
    abort,
    reset,
    restoreFromHistory,
  } = useGeneration({
    settings,
    modelById,
    hasApiKey,
    currentSessionId,
    allHistory: history,
    addToHistory,
    onOpenSettings: () => setIsSettingsOpen(true),
    onForceScrollToBottom: forceScrollToBottom,
  });

  const currentSessionHistory = history.filter(item =>
    item.sessionId === currentSessionId
  );

  // Show settings modal on first load if no API key
  useEffect(() => {
    if (!hasApiKey) {
      setIsSettingsOpen(true);
    }
  }, [hasApiKey]);

  // Auto-scroll on content changes
  useEffect(() => {
    requestAnimationFrame(scrollToBottom);
  }, [synthesizedContent, responses, prompt, scrollToBottom]);

  // Validate user-selected models when models are loaded
  useEffect(() => {
    if (!isLoadingModels && models.length > 0 && !validationDoneRef.current && settings.selectedModels.length > 0) {
      setIsValidating(true);

      const { validModels, removedModels } = validateUserSelectedModels(settings.selectedModels, models);

      if (removedModels.length > 0) {
        console.warn('[Ensemble] Invalid user-selected models removed:', removedModels.map(model => model.modelId).join(', '));
        setRemovedSelectedModels(removedModels);

        if (validModels.length > 0) {
          updateSelectedModels(validModels);
        }
      }

      validationDoneRef.current = true;
      setIsValidating(false);
    }
  }, [isLoadingModels, models, settings.selectedModels, updateSelectedModels, setRemovedSelectedModels, setIsValidating, validateUserSelectedModels, validationDoneRef]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modKey = e.metaKey || e.ctrlKey;

      if (e.key === 'Escape' && isGenerating) {
        e.preventDefault();
        abort();
      }

      if (modKey && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }

      if (modKey && e.key === 'h' && e.shiftKey) {
        e.preventDefault();
        setIsHistoryOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGenerating, abort]);

  const handleNewChat = useCallback(() => {
    reset();
    setCurrentSessionId(uuidv4());
  }, [reset]);

  const handleInspectPrompt = useCallback((data: { messages: Message[], modelId: string }) => {
    setInspectingPrompt(data);
  }, []);

  const handleLoadHistory = useCallback((item: HistoryItem) => {
    abort();

    if (item.sessionId) {
      setCurrentSessionId(item.sessionId);
    } else {
      const newSessionId = uuidv4();
      updateHistoryItem(item.id, { sessionId: newSessionId });
      setCurrentSessionId(newSessionId);
    }

    restoreFromHistory(item);
    setIsHistoryOpen(false);

    setTimeout(forceScrollToBottom, 100);
  }, [abort, updateHistoryItem, restoreFromHistory, forceScrollToBottom]);

  return (
    <div className="app-container">
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onNewChat={handleNewChat}
      />

      <main className="main-content chat-scroll-area">
        <div className="chat-view-main">
          <ModelSelector models={models} isLoading={isLoadingModels || isValidating} />

          {removedModelsWarning && (
            <div className="prompt-warning warning-error">
              <span>⚠️ {removedModelsWarning}</span>
              <button
                onClick={dismissRemovedModelsWarning}
                className="warning-dismiss"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          )}

          {error && (
            <div className="prompt-warning warning-default">
              {error}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="prompt-warning warning-caution">
              {warnings.map((warning, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span>⚠️</span>
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {storageWarning && (
            <div className="prompt-warning warning-info">
              ⚠️ {storageWarning}
            </div>
          )}

          <div className="chat-stream">
            {currentSessionHistory.slice().reverse().map((item) => (
              <div key={item.id}>
                <ChatMessage
                  role="user"
                  content={item.prompt}
                  timestamp={item.timestamp}
                />
                <ChatMessage
                  role="assistant"
                  content={item.synthesizedContent}
                  responses={item.responses}
                  models={models}
                  timestamp={item.timestamp}
                  onInspectPrompt={handleInspectPrompt}
                  synthesisPromptData={item.synthesisPromptData}
                />
              </div>
            ))}

            {(prompt || isGenerating || synthesizedContent) && (
              <div className="active-generation">
                <ChatMessage
                  role="user"
                  content={prompt}
                />
                <ChatMessage
                  role="assistant"
                  content={synthesizedContent}
                  responses={responses}
                  models={models}
                  isStreaming={isSynthesizing}
                  isGenerating={isGenerating}
                  truncatedModels={truncatedModels}
                  onInspectPrompt={handleInspectPrompt}
                  synthesisPromptData={synthesisPromptData}
                />
              </div>
            )}

            {currentSessionHistory.length === 0 && !prompt && !isGenerating && !synthesizedContent && (
              <div className="empty-state">
                <p>Select your team of models above and ask a question to get started.</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      <footer className="chat-footer">
        <div className="chat-input-wrapper footer-prompt-form">
          <PromptInput
            onSubmit={generate}
            onCancel={abort}
            isLoading={isGenerating}
            disabled={!hasApiKey}
            initialValue=""
          />
        </div>
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        models={models}
      />

      <HistorySidebar
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onLoad={handleLoadHistory}
        onDelete={deleteItem}
        onClear={clearHistory}
      />

      {inspectingPrompt && (
        <PromptInspector
          isOpen={!!inspectingPrompt}
          onClose={() => setInspectingPrompt(null)}
          messages={inspectingPrompt.messages}
          modelId={inspectingPrompt.modelId}
        />
      )}
    </div>
  );
}
