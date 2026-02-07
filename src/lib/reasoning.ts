import { Model, ReasoningParams } from '@/types';

export const VALID_REASONING_EFFORTS = [
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
] as const;

export type ReasoningEffort = (typeof VALID_REASONING_EFFORTS)[number];

const REASONING_SUPPORTED_PARAMS = new Set(['reasoning', 'include_reasoning']);
const KNOWN_REASONING_PATTERNS = ['o1', 'o3', 'deepseek-r1', 'deepseek/deepseek-r1', 'qwq'];

export function isValidReasoningEffort(value: unknown): value is ReasoningEffort {
    return typeof value === 'string'
        && (VALID_REASONING_EFFORTS as readonly string[]).includes(value.toLowerCase());
}

export function normalizeReasoningEffort(
    value: unknown,
    fallback: ReasoningEffort = 'medium'
): ReasoningEffort {
    if (typeof value !== 'string') return fallback;
    const normalized = value.toLowerCase();
    return isValidReasoningEffort(normalized) ? normalized : fallback;
}

export function supportsReasoningByParameters(supportedParameters?: string[]): boolean {
    if (!supportedParameters || supportedParameters.length === 0) return false;
    return supportedParameters.some(param => REASONING_SUPPORTED_PARAMS.has(param));
}

export function isReasoningModel(model: Pick<Model, 'id' | 'supported_parameters'>): boolean {
    const id = model.id.toLowerCase();
    const isThinking = id.endsWith(':thinking') || id.includes('-thinking');
    const hasReasoningParam = supportsReasoningByParameters(model.supported_parameters);
    const isKnownReasoningModel = KNOWN_REASONING_PATTERNS.some(pattern => id.includes(pattern));

    return isThinking || hasReasoningParam || isKnownReasoningModel;
}

export function buildReasoningOptions(
    enabled: boolean,
    effort: unknown,
    supportsReasoning: boolean
): { reasoning: ReasoningParams | undefined; includeReasoning: boolean } {
    if (!enabled || !supportsReasoning) {
        return { reasoning: undefined, includeReasoning: false };
    }

    return {
        reasoning: { effort: normalizeReasoningEffort(effort) },
        includeReasoning: true,
    };
}

export function isReasoningUnsupportedError(errorMessage: string): boolean {
    const message = errorMessage.toLowerCase();
    const mentionsReasoning = message.includes('reasoning') || message.includes('include_reasoning');
    const indicatesUnsupported = message.includes('not supported')
        || message.includes('unsupported')
        || message.includes('unknown parameter')
        || message.includes('invalid parameter')
        || message.includes('unrecognized parameter');

    return mentionsReasoning && indicatesUnsupported;
}
