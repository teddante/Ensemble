import { Settings, DEFAULT_SELECTED_MODELS, DEFAULT_REFINEMENT_MODEL } from '@/types';
import { MAX_SYNTHESIS_CHARS } from '@/lib/constants';

export const DEFAULT_CONTEXT_WARNING_THRESHOLD = 0.8;

export function createDefaultSettings(): Settings {
    return {
        apiKey: '',
        selectedModels: [...DEFAULT_SELECTED_MODELS],
        modelConfigs: {},
        refinementModel: DEFAULT_REFINEMENT_MODEL,
        maxSynthesisChars: MAX_SYNTHESIS_CHARS,
        contextWarningThreshold: DEFAULT_CONTEXT_WARNING_THRESHOLD,
        systemPrompt: '',
    };
}
