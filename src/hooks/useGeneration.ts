'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ModelResponse, StreamEvent, Message, Settings, Model } from '@/types';
import { MAX_SYNTHESIS_CHARS, API_ROUTES } from '@/lib/constants';
import { estimateTokens } from '@/lib/openrouter';
import { apiFetch, getErrorMessage } from '@/lib/apiClient';
import { buildChatMessages } from '@/lib/messageBuilder';
import { HistoryItem } from '@/hooks/useHistory';

interface UseGenerationOptions {
    settings: Settings;
    modelById: Map<string, Model>;
    hasApiKey: boolean;
    currentSessionId: string;
    allHistory: HistoryItem[];
    addToHistory: (
        prompt: string,
        models: string[],
        refinementModel: string,
        responses: ModelResponse[],
        synthesizedContent: string,
        modelNames?: Record<string, string>,
        sessionId?: string,
        synthesisPromptData?: { messages: Message[]; modelId: string }
    ) => void;
    onOpenSettings: () => void;
    onForceScrollToBottom: () => void;
}

export function useGeneration({
    settings,
    modelById,
    hasApiKey,
    currentSessionId,
    allHistory,
    addToHistory,
    onOpenSettings,
    onForceScrollToBottom,
}: UseGenerationOptions) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [responses, setResponses] = useState<ModelResponse[]>([]);
    const [synthesizedContent, setSynthesizedContent] = useState('');
    const [truncatedModels, setTruncatedModels] = useState<string[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [prompt, setPrompt] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [synthesisPromptData, setSynthesisPromptData] = useState<{ messages: Message[], modelId: string } | undefined>(undefined);

    const abortControllerRef = useRef<AbortController | null>(null);
    const generationStateRef = useRef<{
        responses: ModelResponse[];
        synthesizedContent: string;
        synthesisPromptData?: { messages: Message[], modelId: string };
    }>({ responses: [], synthesizedContent: '' });

    // Refs for async access to avoid stale closures
    const historyRef = useRef(allHistory);
    useEffect(() => { historyRef.current = allHistory; }, [allHistory]);

    const currentSessionIdRef = useRef(currentSessionId);
    useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

    const clearActiveOutput = useCallback(() => {
        setPrompt('');
        setResponses([]);
        setSynthesizedContent('');
        setSynthesisPromptData(undefined);
        generationStateRef.current = { responses: [], synthesizedContent: '' };
    }, []);

    const abort = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    const reset = useCallback(() => {
        abort();
        clearActiveOutput();
        setError(null);
    }, [abort, clearActiveOutput]);

    const handleStreamEvent = useCallback((event: StreamEvent, originalPrompt: string) => {
        const matchesEventTarget = (response: ModelResponse): boolean => {
            if (event.instanceId) {
                return response.responseId === event.instanceId;
            }
            return response.modelId === event.modelId;
        };

        const updateState = (
            newResponses: ModelResponse[] | ((prev: ModelResponse[]) => ModelResponse[]),
            newSynthesis?: string | ((prev: string) => string)
        ) => {
            setResponses(prevResponses => {
                const updatedResponses = typeof newResponses === 'function' ? newResponses(prevResponses) : newResponses;
                generationStateRef.current.responses = updatedResponses;
                return updatedResponses;
            });

            if (newSynthesis !== undefined) {
                setSynthesizedContent(prevSynth => {
                    const updatedSynth = typeof newSynthesis === 'function' ? newSynthesis(prevSynth) : newSynthesis;
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
                    prev => prev,
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

                addToHistory(
                    originalPrompt,
                    settings.selectedModels,
                    settings.refinementModel,
                    generationStateRef.current.responses,
                    generationStateRef.current.synthesizedContent,
                    undefined,
                    currentSessionId,
                    generationStateRef.current.synthesisPromptData
                );

                clearActiveOutput();
                break;
        }
    }, [addToHistory, settings, currentSessionId, clearActiveOutput]);

    const generate = useCallback(async (newPrompt: string) => {
        if (!hasApiKey) {
            onOpenSettings();
            return;
        }

        // Force scroll to bottom when starting new generation
        setTimeout(onForceScrollToBottom, 10);

        setPrompt(newPrompt);
        setIsGenerating(true);
        setError(null);
        setSynthesizedContent('');
        setSynthesisPromptData(undefined);
        setTruncatedModels([]);
        setWarnings([]);
        setIsSynthesizing(false);

        // Check for context window limits
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

        const initialResponses: ModelResponse[] = selectedModelInstances.map(({ modelId, instanceId }) => ({
            responseId: instanceId,
            modelId,
            content: '',
            status: 'pending',
        }));
        setResponses(initialResponses);
        setSynthesizedContent('');
        generationStateRef.current = { responses: initialResponses, synthesizedContent: '' };

        abortControllerRef.current = new AbortController();

        const currentHistory = historyRef.current.filter(h => h.sessionId === currentSessionIdRef.current);
        const messages = buildChatMessages(settings.systemPrompt, currentHistory, newPrompt);

        try {
            const response = await apiFetch(API_ROUTES.GENERATE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

                while (true) {
                    const eventEnd = buffer.indexOf('\n\n');
                    if (eventEnd === -1) break;

                    const eventData = buffer.slice(0, eventEnd);
                    buffer = buffer.slice(eventEnd + 2);

                    if (eventData.startsWith('data: ')) {
                        try {
                            const event: StreamEvent = JSON.parse(eventData.slice(6));
                            handleStreamEvent(event, newPrompt);
                        } catch (e) {
                            console.error('Failed to parse event:', e);
                        }
                    }
                }
            }

            await reader.cancel();
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                // Request was cancelled by user
            } else {
                const message = err instanceof Error ? err.message : 'An error occurred';
                setError(message);
            }
        } finally {
            setIsGenerating(false);
            setIsSynthesizing(false);
            abortControllerRef.current = null;
        }
    }, [hasApiKey, settings, modelById, handleStreamEvent, onOpenSettings, onForceScrollToBottom]);

    const restoreFromHistory = useCallback((item: HistoryItem) => {
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
    }, []);

    return {
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
    };
}
