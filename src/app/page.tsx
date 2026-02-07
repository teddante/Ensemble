'use client';

import { MAX_SYNTHESIS_CHARS, API_ROUTES } from '@/lib/constants';
import { estimateTokens } from '@/lib/openrouter';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Header } from '@/components/Header';
import { SettingsModal } from '@/components/SettingsModal';
import { PromptInput } from '@/components/PromptInput';
import { ModelSelector } from '@/components/ModelSelector';
// import { ErrorBoundary } from '@/components/ErrorBoundary'; // Removed unused import
import { ChatMessage } from '@/components/ChatMessage';
import { PromptInspector } from '@/components/PromptInspector';
import { useModels } from '@/hooks/useModels';
import { useSettings } from '@/hooks/useSettings';
import { ModelResponse, StreamEvent, Message } from '@/types';
import { apiFetch, getErrorMessage } from '@/lib/apiClient';

import { useHistory, HistoryItem } from '@/hooks/useHistory';
import { HistorySidebar } from '@/components/HistorySidebar';
import { buildChatMessages } from '@/lib/messageBuilder';
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [synthesizedContent, setSynthesizedContent] = useState('');
  const [truncatedModels, setTruncatedModels] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]); // Array of warning messages
  const [prompt, setPrompt] = useState(''); // Need to track prompt for saving/displaying active state
  const [error, setError] = useState<string | null>(null);
  const [inspectingPrompt, setInspectingPrompt] = useState<{ messages: Message[], modelId: string } | null>(null);
  const [synthesisPromptData, setSynthesisPromptData] = useState<{ messages: Message[], modelId: string } | undefined>(undefined);

  // Session Management
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => uuidv4());

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use a ref to store authoritative state for history saving (fixes race condition)
  const generationStateRef = useRef<{
    responses: ModelResponse[];
    synthesizedContent: string;
    synthesisPromptData?: { messages: Message[], modelId: string };
  }>({ responses: [], synthesizedContent: '' });

  // Ref to track history for async access in generation, avoiding stale closures
  const historyRef = useRef<HistoryItem[]>([]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Ref for currentSessionId to ensure latest ID is used in async callbacks
  const currentSessionIdRef = useRef(currentSessionId);
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Filter history for current session
  // Note: For legacy items without sessionId, they will effectively be hidden unless we handle undefined.
  // For now, new items will have sessionId.
  const currentSessionHistory = history.filter(item =>
    item.sessionId === currentSessionId
  );

  const modelById = useMemo(() => buildModelIndex(models), [models]);

  const resetActiveGenerationState = useCallback(() => {
    setPrompt('');
    setResponses([]);
    setSynthesizedContent('');
    setSynthesisPromptData(undefined);
    generationStateRef.current = { responses: [], synthesizedContent: '' };
  }, []);

  const abortActiveGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleStreamEvent = useCallback((event: StreamEvent, originalPrompt: string) => {
    const matchesEventTarget = (response: ModelResponse): boolean => {
      if (event.instanceId) {
        return response.responseId === event.instanceId;
      }
      return response.modelId === event.modelId;
    };

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
          matchesEventTarget(r)
            ? { ...r, status: 'streaming' }
            : r
        ));
        break;

      case 'debug_prompt':
        if (event.promptData) {
          // Identify if this is the synthesis prompt
          // Only synthesis prompt has the specific system instruction or internal drafts structure
          const isSynthesis = event.promptData.messages.some(m =>
            m.role === 'system' && m.content.includes('You are Ensemble AI') ||
            m.role === 'user' && m.content.includes('Here are your internal drafts')
          );

          if (isSynthesis) {
            setSynthesisPromptData(event.promptData);
            generationStateRef.current.synthesisPromptData = event.promptData;
          } else {
            updateState(prev => prev.map(r =>
              matchesEventTarget(r)
                ? { ...r, promptData: event.promptData }
                : r
            ));
          }
        }
        break;

      case 'model_chunk':
        updateState(prev => prev.map(r =>
          matchesEventTarget(r)
            ? { ...r, content: r.content + (event.content || '') }
            : r
        ));
        break;

      case 'model_complete':
        if ((event.content || '').length > MAX_SYNTHESIS_CHARS) {
          setTruncatedModels(prev => [...prev, event.modelId || '']);
        }
        updateState(prev => prev.map(r =>
          matchesEventTarget(r)
            ? { ...r, status: 'complete', content: event.content || r.content, tokens: event.tokens, wordCount: event.wordCount }
            : r
        ));
        break;

      case 'model_error':
        updateState(prev => prev.map(r =>
          matchesEventTarget(r)
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

      case 'warning':
        if (event.warning) {
          setWarnings(prev => [...prev, event.warning!]);
        }
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
          generationStateRef.current.synthesizedContent,
          undefined, // modelNames
          currentSessionId, // sessionId
          generationStateRef.current.synthesisPromptData
        );

        // Clear transient state so it moves to chat history
        resetActiveGenerationState();
        break;
    }
  }, [addToHistory, settings, currentSessionId, resetActiveGenerationState]);

  // Show settings modal on first load if no API key
  useEffect(() => {
    if (!hasApiKey) {
      setIsSettingsOpen(true);
    }
  }, [hasApiKey]);

  // Auto-scroll to bottom with user interrupt detection
  const shouldAutoScrollRef = useRef(true);
  const scrollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;

      // If the user scrolls up, disable auto-scroll
      // We consider "at bottom" if within 50px of the bottom to account for minor calculation differences
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;

      // If we were auto-scrolling but the user moved away from bottom, stop.
      // If the user moved BACK to bottom, resume.
      shouldAutoScrollRef.current = isAtBottom;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Use requestAnimationFrame for smooth scrolling during generation
  useEffect(() => {
    if (!history && !synthesizedContent && !responses && !prompt) return;

    const scrollToBottom = () => {
      if (shouldAutoScrollRef.current && messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };

    // Throttle scroll updates to prevent UI jank
    if (shouldAutoScrollRef.current) {
      if (scrollIntervalRef.current) {
        cancelAnimationFrame(scrollIntervalRef.current);
      }
      scrollIntervalRef.current = requestAnimationFrame(scrollToBottom);
    }

    return () => {
      if (scrollIntervalRef.current) {
        cancelAnimationFrame(scrollIntervalRef.current);
      }
    };
  }, [history, synthesizedContent, responses, prompt]);

  // Validate user-selected models when models are loaded
  useEffect(() => {
    // Only validate once models are loaded and we haven't validated yet
    if (!isLoadingModels && models.length > 0 && !validationDoneRef.current && settings.selectedModels.length > 0) {
      setIsValidating(true);

      const { validModels, removedModels } = validateUserSelectedModels(settings.selectedModels, models);

      // If models were removed, update settings and show notification
      if (removedModels.length > 0) {
        console.warn('[Ensemble] Invalid user-selected models removed:', removedModels.map(model => model.modelId).join(', '));
        setRemovedSelectedModels(removedModels);

        // Update settings with only valid models
        if (validModels.length > 0) {
          updateSelectedModels(validModels);
        }
      }

      validationDoneRef.current = true;
      setIsValidating(false);
    }
  }, [isLoadingModels, models, settings.selectedModels, updateSelectedModels, setRemovedSelectedModels, setIsValidating, validateUserSelectedModels, validationDoneRef]);

  const handleGenerate = useCallback(async (newPrompt: string) => {
    if (!hasApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    // Force scroll to bottom when starting new generation
    shouldAutoScrollRef.current = true;
    // Small timeout to ensure state updates have rendered placeholder before scrolling
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 10);

    setPrompt(newPrompt); // Track current prompt
    setIsGenerating(true);
    setError(null);
    setSynthesizedContent('');
    setSynthesisPromptData(undefined);
    setTruncatedModels([]);
    setWarnings([]); // Clear warnings
    setIsSynthesizing(false);

    // Check for context window limits using accurate token estimation
    const approxTokens = estimateTokens(newPrompt);
    const contextErrors: string[] = [];

    settings.selectedModels.forEach(modelId => {
      const model = modelById.get(modelId);
      if (model && model.contextWindow && approxTokens > model.contextWindow) {
        contextErrors.push(`${model.name} (Limit: ${model.contextWindow.toLocaleString()})`);
      }
    });

    if (contextErrors.length > 0) {
      setError(`Prompt is too long for the following models: ${contextErrors.join(', ')}. Approximate tokens: ${approxTokens.toLocaleString()}`);
      setIsGenerating(false);
      return;
    }

    const selectedModelInstances = settings.selectedModels.map(modelId => ({
      modelId,
      instanceId: uuidv4(),
    }));

    // Initialize response objects for each model instance
    const initialResponses: ModelResponse[] = selectedModelInstances.map(({ modelId, instanceId }) => ({
      responseId: instanceId,
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

    // Construct message history including current prompt
    const currentHistory = historyRef.current.filter(h => h.sessionId === currentSessionIdRef.current);
    const messages = buildChatMessages(settings.systemPrompt, currentHistory, newPrompt);

    try {
      const response = await apiFetch(API_ROUTES.GENERATE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: newPrompt,
          messages,
          models: settings.selectedModels,
          modelInstances: selectedModelInstances,
          modelConfigs: settings.modelConfigs,
          refinementModel: settings.refinementModel,
          maxSynthesisChars: settings.maxSynthesisChars,
          contextWarningThreshold: settings.contextWarningThreshold,
          systemPrompt: settings.systemPrompt,
          sessionId: currentSessionIdRef.current,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Failed to generate response'));
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
        // Request was cancelled by user - this is expected, no action needed
      } else {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
      }
    } finally {
      setIsGenerating(false);
      setIsSynthesizing(false);
      abortControllerRef.current = null;
    }

  }, [hasApiKey, settings.selectedModels, settings.refinementModel, settings.modelConfigs, handleStreamEvent, modelById, settings.contextWarningThreshold, settings.maxSynthesisChars, settings.systemPrompt]);

  const handleCancel = useCallback(() => {
    abortActiveGeneration();
  }, [abortActiveGeneration]);

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

  const handleNewChat = useCallback(() => {
    // Abort active generation if any
    abortActiveGeneration();
    // Start new session
    setCurrentSessionId(uuidv4());

    // Clear active state
    resetActiveGenerationState();
    setError(null);
  }, [abortActiveGeneration, resetActiveGenerationState]);

  const handleInspectPrompt = useCallback((data: { messages: Message[], modelId: string }) => {
    setInspectingPrompt(data);
  }, []);


  const handleLoadHistory = (item: HistoryItem) => {
    // Abort any active generation to prevent session merging
    abortActiveGeneration();

    // Switch to the session of this item
    if (item.sessionId) {
      setCurrentSessionId(item.sessionId);
    } else {
      // Legacy item without session ID, assign one and persist it
      const newSessionId = uuidv4();

      // Update the item in storage so next time it has a session ID
      updateHistoryItem(item.id, { sessionId: newSessionId });

      setCurrentSessionId(newSessionId);
    }

    // Restore state
    setPrompt(item.prompt);
    setResponses(item.responses);
    setSynthesizedContent(item.synthesizedContent);
    setSynthesisPromptData(item.synthesisPromptData);
    generationStateRef.current = {
      responses: item.responses,
      synthesizedContent: item.synthesizedContent,
      synthesisPromptData: item.synthesisPromptData
    };

    setIsGenerating(false);
    setIsSynthesizing(false);
    setError(null);

    // Close sidebar
    setIsHistoryOpen(false);

    // Scroll to bottom of loaded content
    setTimeout(() => {
      shouldAutoScrollRef.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };



  return (
    <div className="app-container">
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onNewChat={handleNewChat}
      />

      <main className="main-content chat-scroll-area">
        {/* Top Configuration Area */}
        <div className="chat-view-main">
          <ModelSelector models={models} isLoading={isLoadingModels || isValidating} />

          {/* Notifications / Errors */}
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

          {/* Chat Messages Stream */}
          <div className="chat-stream">
            {/* Historical Messages for this session */}
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
                  onInspectPrompt={handleInspectPrompt}
                  synthesisPromptData={synthesisPromptData}
                />
              </div>
            )}

            {/* Empty State / Placeholder if no history and no active prompt */}
            {currentSessionHistory.length === 0 && !prompt && !isGenerating && !synthesizedContent && (
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
