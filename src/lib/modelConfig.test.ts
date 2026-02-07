import { describe, it, expect } from 'vitest';
import { getModelConfig, resolveReasoningPreference } from './modelConfig';

describe('modelConfig', () => {
    it('getModelConfig returns default config when model config is missing', () => {
        const config = getModelConfig('missing/model', {});
        expect(config.reasoning?.enabled).toBe(false);
    });

    it('getModelConfig returns explicit model config when present', () => {
        const config = getModelConfig('test/model', {
            'test/model': { reasoning: { enabled: true, effort: 'high' } }
        });
        expect(config.reasoning?.enabled).toBe(true);
        expect(config.reasoning?.effort).toBe('high');
    });

    it('resolveReasoningPreference prioritizes per-model config over global reasoning', () => {
        const result = resolveReasoningPreference(
            'test/model',
            { 'test/model': { reasoning: { enabled: true, effort: 'low' } } },
            { effort: 'high' }
        );

        expect(result).toEqual({ shouldReason: true, effort: 'low' });
    });

    it('resolveReasoningPreference falls back to global reasoning when model config is disabled', () => {
        const result = resolveReasoningPreference(
            'test/model',
            { 'test/model': { reasoning: { enabled: false } } },
            { effort: 'medium' }
        );

        expect(result).toEqual({ shouldReason: true, effort: 'medium' });
    });

    it('resolveReasoningPreference disables reasoning when nothing is configured', () => {
        const result = resolveReasoningPreference('test/model', undefined, undefined);
        expect(result).toEqual({ shouldReason: false });
    });
});
