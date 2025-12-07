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
    const { settings, updateApiKey, updateRefinementModel, updateSettings } = useSettings();
    const [showApiKey, setShowApiKey] = useState(false);
    const [localApiKey, setLocalApiKey] = useState(settings.apiKey);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                </div>

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
    );
}
