import { describe, expect, it } from 'vitest';
import {
    buildReasoningOptions,
    isReasoningModel,
    isReasoningUnsupportedError,
    normalizeReasoningEffort,
    supportsReasoningByParameters,
} from './reasoning';

describe('reasoning utils', () => {
    it('normalizes effort values safely', () => {
        expect(normalizeReasoningEffort('HIGH')).toBe('high');
        expect(normalizeReasoningEffort('invalid')).toBe('medium');
        expect(normalizeReasoningEffort(undefined)).toBe('medium');
    });

    it('detects reasoning support from supported parameters', () => {
        expect(supportsReasoningByParameters(['tools', 'reasoning'])).toBe(true);
        expect(supportsReasoningByParameters(['tools', 'temperature'])).toBe(false);
        expect(supportsReasoningByParameters(undefined)).toBe(false);
    });

    it('builds reasoning payload only when both enabled and supported', () => {
        expect(buildReasoningOptions(false, 'high', true)).toEqual({
            reasoning: undefined,
            includeReasoning: false,
        });
        expect(buildReasoningOptions(true, 'high', false)).toEqual({
            reasoning: undefined,
            includeReasoning: false,
        });
        expect(buildReasoningOptions(true, 'bad-value', true)).toEqual({
            reasoning: { effort: 'medium' },
            includeReasoning: true,
        });
    });

    it('detects reasoning-capable models', () => {
        expect(isReasoningModel({ id: 'openai/o3-mini', supported_parameters: [] })).toBe(true);
        expect(isReasoningModel({ id: 'foo/bar:thinking', supported_parameters: [] })).toBe(true);
        expect(isReasoningModel({ id: 'openai/gpt-4o', supported_parameters: ['reasoning'] })).toBe(true);
        expect(isReasoningModel({ id: 'openai/gpt-4o', supported_parameters: ['tools'] })).toBe(false);
    });

    it('classifies unsupported reasoning errors', () => {
        expect(isReasoningUnsupportedError('reasoning is not supported for this model')).toBe(true);
        expect(isReasoningUnsupportedError('Unknown parameter: include_reasoning')).toBe(true);
        expect(isReasoningUnsupportedError('Rate limit exceeded')).toBe(false);
    });
});
