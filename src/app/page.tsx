'use client';

import { MAX_SYNTHESIS_CHARS, estimateTokens } from '@/lib/openrouter';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from '@/components/Header';
import { SettingsModal } from '@/components/SettingsModal';
import { PromptInput } from '@/components/PromptInput';
import { ModelSelector } from '@/components/ModelSelector';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ChatMessage } from '@/components/ChatMessage';
import { useModels } from '@/hooks/useModels';
import { useSettings } from '@/hooks/useSettings';
import { ModelResponse, StreamEvent } from '@/types';

import { useHistory, HistoryItem } from '@/hooks/useHistory';
import { HistorySidebar } from '@/components/HistorySidebar';

export default function Home() {
  const { settings, hasApiKey, updateSelectedModels } = useSettings();
  const {
    models,
    isLoading: isLoadingModels,
    isValidating,
    setIsValidating,
    removedModelsWarning,
    validateUserSelectedModels,
    dismissRemovedModelsWarning,
    setRemovedSelectedModels,
    validationDoneRef
  } = useModels();
  const { history, addToHistory, deleteItem, clearHistory, storageWarning } = useHistory();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [synthesizedContent, setSynthesizedContent] = useState('');
  const [truncatedModels, setTruncatedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(''); // Need to track prompt for saving/displaying active state
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use a ref to store authoritative state for history saving (fixes race condition)
  const generationStateRef = useRef<{
    responses: ModelResponse[];
    synthesizedContent: string;
  }>({ responses: [], synthesizedContent: '' });

  const handleStreamEvent = useCallback((event: StreamEvent, originalPrompt: string) => {
    // Helper to update both ref and state
    const updateState = (
      newResponses: ModelResponse[] | ((prev: ModelResponse[]) => ModelResponse[]),
      newSynthesis?: string | ((prev: string) => string)
    ) => {
      setResponses(prevResponses => {
        const updatedResponses = typeof newResponses === 'function' ? newResponses(prevResponses) : newResponses;
        // Update ref with new responses
        generationStateRef.current.responses = updatedResponses;
        return updatedResponses;
      });

      if (newSynthesis !== undefined) {
        setSynthesizedContent(prevSynth => {
          const updatedSynth = typeof newSynthesis === 'function' ? newSynthesis(prevSynth) : newSynthesis;
          // Update ref with new synthesis
          generationStateRef.current.synthesizedContent = updatedSynth;
          return updatedSynth;
        });
      }
    };

    switch (event.type) {
      case 'model_start':
        updateState(prev => prev.map(r =>
          r.modelId === event.modelId
            ? { ...r, status: 'streaming' }
            : r
        ));
        break;

      case 'model_chunk':
        updateState(prev => prev.map(r =>
          r.modelId === event.modelId
            ? { ...r, content: r.content + (event.content || '') }
            : r
        ));
        break;

      case 'model_complete':
        if ((event.content || '').length > MAX_SYNTHESIS_CHARS) {
          setTruncatedModels(prev => [...prev, event.modelId || '']);
        }
        updateState(prev => prev.map(r =>
          r.modelId === event.modelId
            ? { ...r, status: 'complete', content: event.content || r.content, tokens: event.tokens }
            : r
        ));
        break;

      case 'model_error':
        updateState(prev => prev.map(r =>
          r.modelId === event.modelId
            ? { ...r, status: 'error', error: event.error }
            : r
        ));
        break;

      case 'synthesis_start':
        setIsSynthesizing(true);
        break;

      case 'synthesis_chunk':
        updateState(
          prev => prev, // No change to responses
          prev => prev + (event.content || '')
        );
        break;

      case 'synthesis_complete':
        setIsSynthesizing(false);
        if (event.content) {
          updateState(
            prev => prev,
            event.content
          );
        }
        break;

      case 'error':
        setError(event.error || 'An error occurred');
        setIsSynthesizing(false);
        break;

      case 'complete':
        setIsGenerating(false);
        setIsSynthesizing(false);

        // Save to history using authoritative ref state
        addToHistory(
          originalPrompt,
          settings.selectedModels,
          settings.refinementModel,
          generationStateRef.current.responses,
          generationStateRef.current.synthesizedContent
        );

        // Clear transient state so it moves to chat history
        setPrompt('');
        setResponses([]);
        setSynthesizedContent('');
        generationStateRef.current = { responses: [], synthesizedContent: '' };
        break;
    }
  }, [addToHistory, settings]);

  // Show settings modal on first load if no API key
  useEffect(() => {
    if (!hasApiKey) {
      setIsSettingsOpen(true);
    }
  }, [hasApiKey]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, synthesizedContent, responses, prompt]);

  // Validate user-selected models when models are loaded
  useEffect(() => {
    // Only validate once models are loaded and we haven't validated yet
    if (!isLoadingModels && models.length > 0 && !validationDoneRef.current && settings.selectedModels.length > 0) {
      setIsValidating(true);

      const { validModels, removedModels } = validateUserSelectedModels(
        settings.selectedModels,
        models
      );

      // If models were removed, update settings and show notification
      if (removedModels.length > 0) {
        console.warn('[Ensemble] Invalid user-selected models removed:', removedModels.map(r => r.modelId).join(', '));
        setRemovedSelectedModels(removedModels);

        // Update settings with only valid models
        if (validModels.length > 0) {
          updateSelectedModels(validModels);
        }
      }

      validationDoneRef.current = true;
      setIsValidating(false);
    }
  }, [isLoadingModels, models, settings.selectedModels, validateUserSelectedModels, updateSelectedModels, setRemovedSelectedModels, setIsValidating, validationDoneRef]);

  const handleGenerate = useCallback(async (newPrompt: string) => {
    if (!hasApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    setPrompt(newPrompt); // Track current prompt
    setIsGenerating(true);
    setError(null);
    setSynthesizedContent('');
    setTruncatedModels([]);
    setIsSynthesizing(false);

    // Check for context window limits using accurate token estimation
    const approxTokens = estimateTokens(newPrompt);
    const contextErrors: string[] = [];

    settings.selectedModels.forEach(modelId => {
      const model = models.find(m => m.id === modelId);
      if (model && model.contextWindow && approxTokens > model.contextWindow) {
        contextErrors.push(`${model.name} (Limit: ${model.contextWindow.toLocaleString()})`);
      }
    });

    if (contextErrors.length > 0) {
      setError(`Prompt is too long for the following models: ${contextErrors.join(', ')}. Approximate tokens: ${approxTokens.toLocaleString()}`);
      setIsGenerating(false);
      return;
    }

    // Initialize response objects for each model
    const initialResponses: ModelResponse[] = settings.selectedModels.map(modelId => ({
      modelId,
      content: '',
      status: 'pending',
    }));
    setResponses(initialResponses);
    setSynthesizedContent('');
    // Initialize ref for new generation
    generationStateRef.current = { responses: initialResponses, synthesizedContent: '' };

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({
          prompt: newPrompt,
          models: settings.selectedModels,
          refinementModel: settings.refinementModel,
        }),
        signal: abortControllerRef.current.signal,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        while (true) {
          const eventEnd = buffer.indexOf('\n\n');
          if (eventEnd === -1) break;

          const eventData = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          // Parse the event
          if (eventData.startsWith('data: ')) {
            try {
              const event: StreamEvent = JSON.parse(eventData.slice(6));
              handleStreamEvent(event, newPrompt); // Pass prompt for saving history
            } catch (e) {
              console.error('Failed to parse event:', e);
            }
          }
        }
      }

      // Cleanup reader when done
      await reader.cancel();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
      }
    } finally {
      setIsGenerating(false);
      setIsSynthesizing(false);
      abortControllerRef.current = null;
    }

  }, [hasApiKey, settings.selectedModels, settings.refinementModel, handleStreamEvent, models]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Detect if Mac (Cmd) or Windows (Ctrl)
      const modKey = e.metaKey || e.ctrlKey;

      // Escape - Cancel generation
      if (e.key === 'Escape' && isGenerating) {
        e.preventDefault();
        handleCancel();
      }

      // Ctrl/Cmd + , - Open settings
      if (modKey && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }

      // Ctrl/Cmd + Shift + H - Open history (Shift added to avoid browser conflict)
      if (modKey && e.key === 'h' && e.shiftKey) {
        e.preventDefault();
        setIsHistoryOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGenerating, handleCancel]);


  const handleLoadHistory = (item: HistoryItem) => {
    // Restoring legacy behavior: just duplicate the prompt to active state for now
    // In chat interface, this is akin to "Copy to composer" or "Retry"
    setPrompt(item.prompt);
    // Don't restore the response/content to active state unless we want to "edit" it?
    // Current app behavior was "restore view".
    // Since we now show history inline, maybe this just sets the prompt input?
    // Let's stick to setting prompt and scrolling to bottom.
    // If we set responses/synthesizedContent, it will show up as a duplicate "Active" message at the bottom.
    // Let's do that for now to preserve "Restore" capability behavior, user can then "Regenerate" if they want.
    setResponses(item.responses);
    setSynthesizedContent(item.synthesizedContent);
    generationStateRef.current = {
      responses: item.responses,
      synthesizedContent: item.synthesizedContent
    };

    setIsGenerating(false);
    setIsSynthesizing(false);
    setError(null);

    // Close sidebar
    setIsHistoryOpen(false);
  };

  return (
    <div className="app-container">
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
      />

      <main className="main-content chat-scroll-area">
        {/* Top Configuration Area */}
        <div className="chat-view-main">
          <ModelSelector models={models} isLoading={isLoadingModels || isValidating} />

          {/* Notifications / Errors */}
          {removedModelsWarning && (
            <div
              className="prompt-warning"
              style={{
                marginBottom: '1.5rem',
                background: 'rgba(255, 100, 50, 0.1)',
                borderColor: 'rgba(255, 100, 50, 0.5)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '1rem'
              }}
            >
              <span>⚠️ {removedModelsWarning}</span>
              <button
                onClick={dismissRemovedModelsWarning}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  color: 'inherit',
                  opacity: 0.7,
                  padding: '0 0.25rem',
                  lineHeight: 1
                }}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          )}

          {error && (
            <div className="prompt-warning" style={{ marginBottom: '1.5rem' }}>
              {error}
            </div>
          )}

          {storageWarning && (
            <div className="prompt-warning" style={{ marginBottom: '1.5rem', background: 'rgba(255, 170, 0, 0.1)', borderColor: 'rgba(255, 170, 0, 0.5)' }}>
              ⚠️ {storageWarning}
            </div>
          )}

          {/* Chat Messages Stream */}
          <div className="chat-stream">
            {/* Historical Messages */}
            {history.slice().reverse().map((item) => (
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
                />
              </div>
            ))}

            {/* Active / Pending Message */}
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
                />
              </div>
            )}

            {/* Empty State / Placeholder if no history and no active prompt */}
            {history.length === 0 && !prompt && !isGenerating && !synthesizedContent && (
              <div style={{
                textAlign: 'center',
                color: 'var(--color-text-tertiary)',
                marginTop: '4rem',
                padding: '2rem'
              }}>
                <p>Select your team of models above and ask a question to get started.</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      {/* Fixed Footer Input */}
      <footer className="chat-footer">
        <div className="chat-input-wrapper footer-prompt-form">
          <PromptInput
            onSubmit={handleGenerate}
            onCancel={handleCancel}
            isLoading={isGenerating}
            disabled={!hasApiKey}
            initialValue="" // Always clear input (we track active prompt in page state)
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
    </div>
  );
}
