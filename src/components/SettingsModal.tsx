'use client';

import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, ExternalLink, Loader2 } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { Model } from '@/types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    models: Model[];
}

export function SettingsModal({ isOpen, onClose, models }: SettingsModalProps) {
    const { settings, updateApiKey, updateRefinementModel } = useSettings();
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
            const result = await updateApiKey(localApiKey);
            if (result.success) {
                onClose();
            } else {
                setError(result.error || 'Failed to save API key');
            }
        } catch (err) {
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

