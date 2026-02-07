import { ModelConfig, ReasoningParams } from '@/types';

const DEFAULT_REASONING_CONFIG = Object.freeze({ enabled: false });
const DEFAULT_MODEL_CONFIG = Object.freeze({
    reasoning: DEFAULT_REASONING_CONFIG,
});

export function getModelConfig(
    modelId: string,
    modelConfigs: Record<string, ModelConfig> | undefined
): ModelConfig {
    return modelConfigs?.[modelId] ?? DEFAULT_MODEL_CONFIG;
}

export function resolveReasoningPreference(
    modelId: string,
    modelConfigs: Record<string, { reasoning?: { enabled?: boolean; effort?: ReasoningParams['effort'] } }> | undefined,
    globalReasoning: { effort?: ReasoningParams['effort'] } | undefined
): { shouldReason: boolean; effort?: ReasoningParams['effort'] } {
    const config = modelConfigs?.[modelId]?.reasoning;

    if (config?.enabled) {
        return { shouldReason: true, effort: config.effort };
    }

    if (globalReasoning) {
        return { shouldReason: true, effort: globalReasoning.effort };
    }

    return { shouldReason: false };
}
