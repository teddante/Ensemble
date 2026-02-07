'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Settings, ModelConfig } from '@/types';
import { API_KEY_MASK, API_ROUTES } from '@/lib/constants';
import { createDefaultSettings } from '@/lib/settingsDefaults';
import { getErrorMessage, apiFetch } from '@/lib/apiClient';
import { getLocalStorageJSON, setLocalStorageJSON } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storageKeys';

interface SettingsContextType {
    settings: Settings;
    updateApiKey: (key: string) => Promise<{ success: boolean; error?: string }>;
    updateSelectedModels: (models: string[]) => void;
    updateModelConfig: (modelId: string, config: ModelConfig) => void;
    updateRefinementModel: (model: string) => void;
    updateSystemPrompt: (prompt: string) => void;
    updateSettings: (newSettings: Partial<Settings>) => void;
    hasApiKey: boolean;
    isCheckingKey: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = STORAGE_KEYS.SETTINGS;

type PersistedSettings = Omit<Settings, 'apiKey'>;
type PersistedSettingsKey = keyof PersistedSettings;

const PERSISTED_SETTINGS_KEYS: PersistedSettingsKey[] = [
    'selectedModels',
    'modelConfigs',
    'refinementModel',
    'maxSynthesisChars',
    'contextWarningThreshold',
    'systemPrompt',
];

function assignPersistedField<K extends PersistedSettingsKey>(
    target: PersistedSettings,
    key: K,
    value: PersistedSettings[K]
): void {
    target[key] = value;
}

function toPersistedSettings(settings: Settings): PersistedSettings {
    const persisted = {} as PersistedSettings;
    for (const key of PERSISTED_SETTINGS_KEYS) {
        assignPersistedField(persisted, key, settings[key]);
    }
    return persisted;
}

function loadPersistedSettings(): PersistedSettings {
    const defaults = createDefaultSettings();
    const parsed = getLocalStorageJSON<Partial<PersistedSettings> | null>(STORAGE_KEY, null);

    if (!parsed) {
        return toPersistedSettings(defaults);
    }

    const defaultPersisted = toPersistedSettings(defaults);

    const hydrated = {} as PersistedSettings;
    for (const key of PERSISTED_SETTINGS_KEYS) {
        assignPersistedField(hydrated, key, (parsed[key] ?? defaultPersisted[key]) as PersistedSettings[typeof key]);
    }
    return hydrated;
}

function loadSettings(): Settings {
    const defaults = createDefaultSettings();
    return {
        ...defaults,
        ...loadPersistedSettings(),
        apiKey: '',
    };
}

function saveSettings(settings: Settings): void {
    if (!setLocalStorageJSON(STORAGE_KEY, toPersistedSettings(settings))) {
        console.error('Failed to save settings');
    }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<Settings>(createDefaultSettings);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [isCheckingKey, setIsCheckingKey] = useState(true);
    const [isHydrated, setIsHydrated] = useState(false);

    // Check if server has key
    const checkServerKey = async () => {
        setIsCheckingKey(true);
        try {
            const res = await apiFetch(API_ROUTES.KEY);
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
                const res = await apiFetch(API_ROUTES.KEY, {
                    method: 'DELETE',
                });
                if (res.ok) {
                    setHasApiKey(false);
                    setSettings(prev => ({ ...prev, apiKey: '' }));
                    return { success: true };
                } else {
                    return { success: false, error: await getErrorMessage(res, 'Failed to delete key') };
                }
            } catch {
                return { success: false, error: 'Network error' };
            }
        }

        // Save key to server
        try {
            const res = await apiFetch(API_ROUTES.KEY, {
                method: 'POST',
                body: JSON.stringify({ apiKey: key }),
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (res.ok) {
                setHasApiKey(true);
                setSettings(prev => ({ ...prev, apiKey: API_KEY_MASK }));
                return { success: true };
            } else {
                return { success: false, error: await getErrorMessage(res, 'Failed to save key') };
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

    const updateModelConfig = (modelId: string, config: ModelConfig) => {
        setSettings(prev => ({
            ...prev,
            modelConfigs: {
                ...prev.modelConfigs,
                [modelId]: config
            }
        }));
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
                updateModelConfig,

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

