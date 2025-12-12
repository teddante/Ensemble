'use client';

import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, ExternalLink, Loader2 } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { Model } from '@/types';
import { API_KEY_MASK } from '@/lib/constants';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    models: Model[];
}

export function SettingsModal({ isOpen, onClose, models }: SettingsModalProps) {
    const { settings, updateApiKey, updateRefinementModel, updateSettings, updateModelConfig } = useSettings();
    const [showApiKey, setShowApiKey] = useState(false);
    const [localApiKey, setLocalApiKey] = useState(settings.apiKey);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter models that support reasoning
    // Detection: 
    // 1. Model ID ends with :thinking variant
    // 2. supported_parameters includes 'reasoning' or 'include_reasoning'
    // 3. Known reasoning model patterns (o1, o3, deepseek-r1, etc.)
    const reasoningModels = models.filter(m => {
        const isThinking = m.id.endsWith(':thinking') || m.id.includes('-thinking');
        const hasReasoningParam = m.supported_parameters?.includes('reasoning') || m.supported_parameters?.includes('include_reasoning');

        // Known reasoning models by ID pattern
        const knownReasoningPatterns = [
            'o1', 'o3', // OpenAI reasoning models
            'deepseek-r1', 'deepseek/deepseek-r1', // DeepSeek R1
            'qwq', // Alibaba QwQ
        ];
        const isKnownReasoningModel = knownReasoningPatterns.some(pattern =>
            m.id.toLowerCase().includes(pattern)
        );

        // Only show config if model is selected
        const isSelected = settings.selectedModels.includes(m.id);
        return isSelected && (isThinking || hasReasoningParam || isKnownReasoningModel);
    });

    // Debug: Log what's happening
    console.log('[SettingsModal] Selected models:', settings.selectedModels);
    console.log('[SettingsModal] Models with supported_parameters:', models.filter(m => settings.selectedModels.includes(m.id)).map(m => ({ id: m.id, params: m.supported_parameters })));
    console.log('[SettingsModal] Reasoning models found:', reasoningModels.map(m => m.id));

    // Sync local state when modal opens or settings change
    useEffect(() => {
        if (isOpen) {
            setLocalApiKey(settings.apiKey);
            setError(null);
        }
    }, [isOpen, settings.apiKey]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);

        try {
            // Only update API key if it's not the mask
            if (localApiKey !== API_KEY_MASK) {
                const result = await updateApiKey(localApiKey);
                if (!result.success) {
                    setError(result.error || 'Failed to save API key');
                    return;
                }
            }

            // Close modal on success (refinement model is updated via state/effect immediately)
            onClose();
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setIsSaving(false);
        }
    };

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !isSaving) {
            onClose();
        }
    };

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close" disabled={isSaving}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="form-group">
                        <label htmlFor="api-key">OpenRouter API Key</label>
                        <div className="api-key-input-wrapper">
                            <input
                                id="api-key"
                                type={showApiKey ? 'text' : 'password'}
                                value={localApiKey}
                                onChange={(e) => {
                                    setLocalApiKey(e.target.value);
                                    setError(null);
                                }}
                                placeholder="sk-or-..."
                                className="api-key-input"
                                disabled={isSaving}
                            />
                            <button
                                type="button"
                                className="toggle-visibility"
                                onClick={() => setShowApiKey(!showApiKey)}
                                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                                disabled={isSaving}
                            >
                                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {error && (
                            <p className="form-error" style={{ color: 'var(--accent-error)', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                                {error}
                            </p>
                        )}
                        <p className="form-help">
                            Get your API key from{' '}
                            <a
                                href="https://openrouter.ai/keys"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="external-link"
                            >
                                OpenRouter <ExternalLink size={14} />
                            </a>
                        </p>
                    </div>

                    <div className="form-group">
                        <label htmlFor="refinement-model">Synthesis Model</label>
                        <select
                            id="refinement-model"
                            value={settings.refinementModel}
                            onChange={(e) => updateRefinementModel(e.target.value)}
                            className="select-input"
                            disabled={isSaving}
                        >
                            {models.map((model) => (
                                <option key={model.id} value={model.id}>
                                    {model.name} ({model.provider})
                                </option>
                            ))}
                        </select>
                        <p className="form-help">
                            The model used to synthesize responses from all selected models.
                        </p>
                    </div>

                    <div className="form-group">
                        <label htmlFor="system-prompt">System Instructions</label>
                        <textarea
                            id="system-prompt"
                            value={settings.systemPrompt}
                            onChange={(e) => updateSettings({ systemPrompt: e.target.value })}
                            className="api-key-input"
                            style={{ width: '100%', minHeight: '100px', resize: 'vertical', fontFamily: 'inherit' }}
                            placeholder="e.g., You are a pirate. Respond to every message with 'Arrr!'"
                            disabled={isSaving}
                        />
                        <p className="form-help">
                            Custom instructions sent to all models and the synthesizer.
                        </p>
                    </div>

                    {reasoningModels.length > 0 && (
                        <>
                            <div className="section-divider" style={{ margin: '1.5rem 0', borderTop: '1px solid var(--color-border)' }} />
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Model Configuration</h3>
                            <div className="model-configs">
                                {reasoningModels.map(model => {
                                    const config = settings.modelConfigs[model.id] || { reasoning: { enabled: false } };
                                    const isThinking = model.id.endsWith(':thinking');
                                    // Some models might force reasoning on
                                    const isForced = isThinking;

                                    return (
                                        <div key={model.id} className="form-group" style={{ marginBottom: '1.5rem', background: 'var(--color-bg-secondary)', padding: '1rem', borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <label style={{ fontWeight: 600, marginBottom: 0 }}>{model.name}</label>
                                                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{model.provider}</span>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        id={`reasoning-toggle-${model.id}`}
                                                        checked={config.reasoning?.enabled ?? false}
                                                        onChange={(e) => {
                                                            const enabled = e.target.checked;
                                                            updateModelConfig(model.id, {
                                                                ...config,
                                                                reasoning: {
                                                                    ...config.reasoning,
                                                                    enabled
                                                                }
                                                            });
                                                        }}
                                                        disabled={isSaving || isForced}
                                                    />
                                                    <label htmlFor={`reasoning-toggle-${model.id}`} style={{ marginBottom: 0, cursor: 'pointer' }}>
                                                        Enable Reasoning {isForced && '(Always on)'}
                                                    </label>
                                                </div>

                                                {(config.reasoning?.enabled || isForced) && (
                                                    <div style={{ paddingLeft: '1.5rem' }}>
                                                        <label htmlFor={`effort-${model.id}`} style={{ fontSize: '0.875rem' }}>Reasoning Effort</label>
                                                        <select
                                                            id={`effort-${model.id}`}
                                                            value={config.reasoning?.effort || 'medium'}
                                                            onChange={(e) => {
                                                                updateModelConfig(model.id, {
                                                                    ...config,
                                                                    reasoning: {
                                                                        ...config.reasoning,
                                                                        enabled: true,
                                                                        effort: e.target.value as 'low' | 'medium' | 'high'
                                                                    }
                                                                });
                                                            }}
                                                            className="select-input"
                                                            style={{ fontSize: '0.875rem', padding: '0.25rem 0.5rem' }}
                                                            disabled={isSaving}
                                                        >
                                                            <option value="low">Low</option>
                                                            <option value="medium">Medium</option>
                                                            <option value="high">High</option>
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    <div className="section-divider" style={{ margin: '1.5rem 0', borderTop: '1px solid var(--color-border)' }} />

                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Limits & Thresholds</h3>

                    <div className="form-group">
                        <label htmlFor="max-synthesis-chars">Max Synthesis Characters</label>
                        <input
                            id="max-synthesis-chars"
                            type="number"
                            value={settings.maxSynthesisChars}
                            onChange={(e) => updateSettings({ maxSynthesisChars: parseInt(e.target.value) || 0 })}
                            className="api-key-input" // Reuse style
                            style={{ width: '100%' }}
                            disabled={isSaving}
                            min={100}
                            max={100000}
                        />
                        <p className="form-help">
                            Truncate model outputs in synthesis to save tokens. Default: 32000.
                        </p>
                    </div>

                    <div className="form-group">
                        <label htmlFor="context-warning-threshold">Context Warning Threshold ({Math.round(settings.contextWarningThreshold * 100)}%)</label>
                        <input
                            id="context-warning-threshold"
                            type="range"
                            min="0.1"
                            max="0.95"
                            step="0.05"
                            value={settings.contextWarningThreshold}
                            onChange={(e) => updateSettings({ contextWarningThreshold: parseFloat(e.target.value) })}
                            style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                            disabled={isSaving}
                        />
                        <p className="form-help">
                            Warn when synthesis prompts exceed this percentage of the context window.
                        </p>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="button-secondary" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </button>
                    <button className="button-primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (
                            <>
                                <Loader2 size={16} className="spin" />
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
