'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Settings, DEFAULT_SELECTED_MODELS, DEFAULT_REFINEMENT_MODEL } from '@/types';

interface SettingsContextType {
    settings: Settings;
    updateApiKey: (key: string) => void;
    updateSelectedModels: (models: string[]) => void;
    updateRefinementModel: (model: string) => void;
    hasApiKey: boolean;
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
            };
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }

    return {
        apiKey: '',
        selectedModels: DEFAULT_SELECTED_MODELS,
        refinementModel: DEFAULT_REFINEMENT_MODEL,
    };
}

function saveSettings(settings: Settings): void {
    if (typeof window === 'undefined') return;

    try {
        // Don't save apiKey to localStorage
        const safeSettings = {
            selectedModels: settings.selectedModels,
            refinementModel: settings.refinementModel,
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
    });
    const [hasApiKey, setHasApiKey] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);

    // Check if server has key
    const checkServerKey = async () => {
        try {
            const res = await fetch('/api/key');
            if (res.ok) {
                const data = await res.json();
                setHasApiKey(data.hasKey);
                // We fake the key in state to avoid breaking other components that check length
                // But the actual key is in the cookie
                setSettings(prev => ({ ...prev, apiKey: data.hasKey ? '********' : '' }));
            }
        } catch (e) {
            console.error('Failed to check server key', e);
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

    const updateApiKey = async (key: string) => {
        if (!key) {
            // Delete key
            await fetch('/api/key', { method: 'DELETE' });
            setHasApiKey(false);
            setSettings(prev => ({ ...prev, apiKey: '' }));
            return;
        }

        // Save key to server
        const res = await fetch('/api/key', {
            method: 'POST',
            body: JSON.stringify({ apiKey: key }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            setHasApiKey(true);
            setSettings(prev => ({ ...prev, apiKey: '********' }));
        } else {
            // Handle error if needed, but for now we trust validation was done before call or UI handles it
            console.error('Failed to set key');
        }
    };

    const updateSelectedModels = (models: string[]) => {
        setSettings(prev => ({ ...prev, selectedModels: models }));
    };

    const updateRefinementModel = (model: string) => {
        setSettings(prev => ({ ...prev, refinementModel: model }));
    };

    return (
        <SettingsContext.Provider
            value={{
                settings,
                updateApiKey,
                updateSelectedModels,
                updateRefinementModel,
                hasApiKey,
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
