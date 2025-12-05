'use client';

import { useState, useCallback, useRef } from 'react';
import { Header } from '@/components/Header';
import { SettingsModal } from '@/components/SettingsModal';
import { PromptInput } from '@/components/PromptInput';
import { ModelSelector } from '@/components/ModelSelector';
import { ResponsePanel } from '@/components/ResponsePanel';
import { SynthesizedResponse } from '@/components/SynthesizedResponse';
import { useSettings } from '@/hooks/useSettings';
import { ModelResponse, StreamEvent } from '@/types';

export default function Home() {
  const { settings, hasApiKey } = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [synthesizedContent, setSynthesizedContent] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Show settings modal on first load if no API key
  useState(() => {
    if (!hasApiKey) {
      setIsSettingsOpen(true);
    }
  });

  const handleGenerate = useCallback(async (prompt: string) => {
    if (!hasApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    // Reset state
    setIsGenerating(true);
    setError(null);
    setSynthesizedContent('');
    setIsSynthesizing(false);

    // Initialize response objects for each model
    const initialResponses: ModelResponse[] = settings.selectedModels.map(modelId => ({
      modelId,
      content: '',
      status: 'pending',
    }));
    setResponses(initialResponses);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          models: settings.selectedModels,
          apiKey: settings.apiKey,
          refinementModel: settings.refinementModel,
        }),
        signal: abortControllerRef.current.signal,
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
              handleStreamEvent(event);
            } catch (e) {
              console.error('Failed to parse event:', e);
            }
          }
        }
      }
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
  }, [hasApiKey, settings]);

  const handleStreamEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'model_start':
        setResponses(prev => prev.map(r =>
          r.modelId === event.modelId
            ? { ...r, status: 'streaming' }
            : r
        ));
        break;

      case 'model_chunk':
        setResponses(prev => prev.map(r =>
          r.modelId === event.modelId
            ? { ...r, content: r.content + (event.content || '') }
            : r
        ));
        break;

      case 'model_complete':
        setResponses(prev => prev.map(r =>
          r.modelId === event.modelId
            ? { ...r, status: 'complete', content: event.content || r.content }
            : r
        ));
        break;

      case 'model_error':
        setResponses(prev => prev.map(r =>
          r.modelId === event.modelId
            ? { ...r, status: 'error', error: event.error }
            : r
        ));
        break;

      case 'synthesis_start':
        setIsSynthesizing(true);
        break;

      case 'synthesis_chunk':
        setSynthesizedContent(prev => prev + (event.content || ''));
        break;

      case 'synthesis_complete':
        setIsSynthesizing(false);
        if (event.content) {
          setSynthesizedContent(event.content);
        }
        break;

      case 'error':
        setError(event.error || 'An error occurred');
        setIsSynthesizing(false);
        break;

      case 'complete':
        setIsGenerating(false);
        setIsSynthesizing(false);
        break;
    }
  }, []);

  return (
    <div className="app-container">
      <Header onOpenSettings={() => setIsSettingsOpen(true)} />

      <main className="main-content">
        <PromptInput
          onSubmit={handleGenerate}
          isLoading={isGenerating}
          disabled={!hasApiKey}
        />

        <ModelSelector />

        {error && (
          <div className="prompt-warning" style={{ marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        <SynthesizedResponse
          content={synthesizedContent}
          isStreaming={isSynthesizing}
          isGenerating={isGenerating}
        />

        <ResponsePanel responses={responses} />
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
