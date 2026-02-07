// Centralized storage key constants to prevent typos and enable easy refactoring

export const STORAGE_KEYS = {
    HISTORY: 'ensemble_history',
    SETTINGS: 'ensemble-settings',
    MODELS_CACHE: 'ensemble_models_cache',
    VALIDATED_FALLBACK: 'ensemble_validated_fallback',
} as const;
