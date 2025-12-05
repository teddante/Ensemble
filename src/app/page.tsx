'use client';

import { MAX_SYNTHESIS_CHARS } from '@/lib/openrouter';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from '@/components/Header';
import { SettingsModal } from '@/components/SettingsModal';
import { PromptInput } from '@/components/PromptInput';
import { ModelSelector } from '@/components/ModelSelector';
import { ResponsePanel } from '@/components/ResponsePanel';
import { SynthesizedResponse } from '@/components/SynthesizedResponse';
import { useModels } from '@/hooks/useModels';
import { useSettings } from '@/hooks/useSettings';
import { ModelResponse, StreamEvent } from '@/types';

import { useHistory, HistoryItem } from '@/hooks/useHistory';
import { HistorySidebar } from '@/components/HistorySidebar';

export default function Home() {
  const { settings, hasApiKey } = useSettings();
  const { models, isLoading: isLoadingModels } = useModels();
  const { history, addToHistory, deleteItem, clearHistory } = useHistory();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [synthesizedContent, setSynthesizedContent] = useState('');
  const [truncatedModels, setTruncatedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(''); // Need to track prompt for saving
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Show settings modal on first load if no API key
  useEffect(() => {
    if (!hasApiKey) {
      setIsSettingsOpen(true);
    }
  }, [hasApiKey]);

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

    // Check for context window limits
    const approxTokens = Math.ceil(newPrompt.length / 4);
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
  }, [hasApiKey, settings.selectedModels, settings.refinementModel]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

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
        break;
    }
  }, [addToHistory, settings]);

  const handleLoadHistory = (item: HistoryItem) => {
    // Restore state
    setPrompt(item.prompt);
    setResponses(item.responses);
    setSynthesizedContent(item.synthesizedContent);
    // Sync ref
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

      <main className="main-content">
        <PromptInput
          onSubmit={handleGenerate}
          onCancel={handleCancel}
          isLoading={isGenerating}
          disabled={!hasApiKey}
          initialValue={prompt}
        />

        <ModelSelector models={models} isLoading={isLoadingModels} />

        {error && (
          <div className="prompt-warning" style={{ marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {/* Show synthesis if there is content OR if we are generating */}
        {(synthesizedContent || isGenerating) && (
          <SynthesizedResponse
            content={synthesizedContent}
            isStreaming={isSynthesizing}
            isGenerating={isGenerating}
            truncatedModels={truncatedModels}
          />
        )}

        <ResponsePanel responses={responses} models={models} />
      </main>

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
