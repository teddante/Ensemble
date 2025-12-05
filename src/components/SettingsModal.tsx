'use client';

import { useState } from 'react';
import { X, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { DEFAULT_MODELS } from '@/types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { settings, updateApiKey, updateRefinementModel } = useSettings();
    const [showApiKey, setShowApiKey] = useState(false);
    const [localApiKey, setLocalApiKey] = useState(settings.apiKey);

    if (!isOpen) return null;

    const handleSave = () => {
        updateApiKey(localApiKey);
        onClose();
    };

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
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
                                onChange={(e) => setLocalApiKey(e.target.value)}
                                placeholder="sk-or-..."
                                className="api-key-input"
                            />
                            <button
                                type="button"
                                className="toggle-visibility"
                                onClick={() => setShowApiKey(!showApiKey)}
                                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                            >
                                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
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
                        >
                            {DEFAULT_MODELS.map((model) => (
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
                    <button className="button-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="button-primary" onClick={handleSave}>
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
