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

function loadSettings(): Settings {
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
                apiKey: parsed.apiKey || '',
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
    const [isHydrated, setIsHydrated] = useState(false);

    // Load settings from localStorage on mount
    useEffect(() => {
        setSettings(loadSettings());
        setIsHydrated(true);
    }, []);

    // Save settings whenever they change (after hydration)
    useEffect(() => {
        if (isHydrated) {
            saveSettings(settings);
        }
    }, [settings, isHydrated]);

    const updateApiKey = (key: string) => {
        setSettings(prev => ({ ...prev, apiKey: key }));
    };

    const updateSelectedModels = (models: string[]) => {
        setSettings(prev => ({ ...prev, selectedModels: models }));
    };

    const updateRefinementModel = (model: string) => {
        setSettings(prev => ({ ...prev, refinementModel: model }));
    };

    const hasApiKey = settings.apiKey.trim().length > 0;

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
