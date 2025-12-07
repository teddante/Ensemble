'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Settings, DEFAULT_SELECTED_MODELS, DEFAULT_REFINEMENT_MODEL } from '@/types';
import { API_KEY_MASK, MAX_SYNTHESIS_CHARS } from '@/lib/constants';

interface SettingsContextType {
    settings: Settings;
    updateApiKey: (key: string) => Promise<{ success: boolean; error?: string }>;
    updateSelectedModels: (models: string[]) => void;
    updateRefinementModel: (model: string) => void;
    updateSystemPrompt: (prompt: string) => void;
    updateSettings: (newSettings: Partial<Settings>) => void;
    hasApiKey: boolean;
    isCheckingKey: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'ensemble-settings';

// Simplified loadSettings to only handle non-sensitive data
function loadSettings(): Omit<Settings, 'apiKey'> & { apiKey: string } {
    if (typeof window === 'undefined') {
        return {
            apiKey: '',
            selectedModels: DEFAULT_SELECTED_MODELS,

            refinementModel: DEFAULT_REFINEMENT_MODEL,
            maxSynthesisChars: MAX_SYNTHESIS_CHARS,
            contextWarningThreshold: 0.8,
            systemPrompt: '',
        };
    }

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                apiKey: '', // Never load key from local storage anymore
                selectedModels: parsed.selectedModels || DEFAULT_SELECTED_MODELS,

                refinementModel: parsed.refinementModel || DEFAULT_REFINEMENT_MODEL,
                maxSynthesisChars: parsed.maxSynthesisChars || MAX_SYNTHESIS_CHARS,
                contextWarningThreshold: parsed.contextWarningThreshold || 0.8,
                systemPrompt: parsed.systemPrompt || '',
            };
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }

    return {
        apiKey: '',
        selectedModels: DEFAULT_SELECTED_MODELS,

        refinementModel: DEFAULT_REFINEMENT_MODEL,
        maxSynthesisChars: MAX_SYNTHESIS_CHARS,
        contextWarningThreshold: 0.8,
        systemPrompt: '',
    };
}

function saveSettings(settings: Settings): void {
    if (typeof window === 'undefined') return;

    try {
        // Don't save apiKey to localStorage
        const safeSettings = {
            selectedModels: settings.selectedModels,

            refinementModel: settings.refinementModel,
            maxSynthesisChars: settings.maxSynthesisChars,
            contextWarningThreshold: settings.contextWarningThreshold,
            systemPrompt: settings.systemPrompt,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSettings));
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<Settings>({
        apiKey: '',
        selectedModels: DEFAULT_SELECTED_MODELS,

        refinementModel: DEFAULT_REFINEMENT_MODEL,
        maxSynthesisChars: MAX_SYNTHESIS_CHARS,
        contextWarningThreshold: 0.8,
        systemPrompt: '',
    });
    const [hasApiKey, setHasApiKey] = useState(false);
    const [isCheckingKey, setIsCheckingKey] = useState(true);
    const [isHydrated, setIsHydrated] = useState(false);

    // Check if server has key
    const checkServerKey = async () => {
        setIsCheckingKey(true);
        try {
            const res = await fetch('/api/key', {
                credentials: 'include',
                headers: { 'X-Requested-With': 'fetch' },
            });
            if (res.ok) {
                const data = await res.json();
                setHasApiKey(data.hasKey);
                // We fake the key in state to avoid breaking other components that check length
                // But the actual key is in the cookie
                setSettings(prev => ({ ...prev, apiKey: data.hasKey ? API_KEY_MASK : '' }));
            }
        } catch (e) {
            console.error('Failed to check server key', e);
        } finally {
            setIsCheckingKey(false);
        }
    };

    // Load settings from localStorage on mount and check server key
    useEffect(() => {
        setSettings(loadSettings());
        checkServerKey();
        setIsHydrated(true);
    }, []);

    // Save settings (excluding key) whenever they change
    useEffect(() => {
        if (isHydrated) {
            saveSettings(settings);
        }
    }, [settings, isHydrated]);

    const updateApiKey = async (key: string): Promise<{ success: boolean; error?: string }> => {
        if (!key) {
            // Delete key
            try {
                const res = await fetch('/api/key', {
                    method: 'DELETE',
                    headers: { 'X-Requested-With': 'fetch' },
                    credentials: 'include',
                });
                if (res.ok) {
                    setHasApiKey(false);
                    setSettings(prev => ({ ...prev, apiKey: '' }));
                    return { success: true };
                } else {
                    const data = await res.json();
                    return { success: false, error: data.error || 'Failed to delete key' };
                }
            } catch {
                return { success: false, error: 'Network error' };
            }
        }

        // Save key to server
        try {
            const res = await fetch('/api/key', {
                method: 'POST',
                body: JSON.stringify({ apiKey: key }),
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'fetch',
                },
                credentials: 'include',
            });

            if (res.ok) {
                setHasApiKey(true);
                setSettings(prev => ({ ...prev, apiKey: API_KEY_MASK }));
                return { success: true };
            } else {
                const data = await res.json();
                return { success: false, error: data.error || 'Failed to save key' };
            }
        } catch (error) {
            console.error('Failed to set key:', error);
            return { success: false, error: 'Network error' };
        }
    };

    const updateSelectedModels = (models: string[]) => {
        setSettings(prev => ({ ...prev, selectedModels: models }));
    };

    const updateRefinementModel = (model: string) => {
        setSettings(prev => ({ ...prev, refinementModel: model }));
    };

    const updateSystemPrompt = (prompt: string) => {
        setSettings(prev => ({ ...prev, systemPrompt: prompt }));
    };

    const updateSettings = (newSettings: Partial<Settings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    return (
        <SettingsContext.Provider
            value={{
                settings,
                updateApiKey,
                updateSelectedModels,

                updateRefinementModel,
                updateSystemPrompt,
                updateSettings,
                hasApiKey,
                isCheckingKey,
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings(): SettingsContextType {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}

