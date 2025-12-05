import { describe, it, expect } from 'vitest';
import { createSynthesisPrompt } from './openrouter';

describe('createSynthesisPrompt', () => {
    it('should create a basic synthesis prompt', () => {
        const prompt = createSynthesisPrompt('What is AI?', [
            { modelId: 'gpt-4', content: 'AI is artificial intelligence.' },
            { modelId: 'claude-3', content: 'AI stands for Artificial Intelligence.' }
        ]);

        expect(prompt).toContain('Original User Prompt:');
        expect(prompt).toContain('"What is AI?"');
        expect(prompt).toContain('--- Response 1 (from gpt-4) ---');
        expect(prompt).toContain('AI is artificial intelligence.');
        expect(prompt).toContain('Synthesized Response:');
    });

    it('should truncate extremely long responses', () => {
        const longContent = 'a'.repeat(10000);
        const prompt = createSynthesisPrompt('Long prompt', [
            { modelId: 'verbose-model', content: longContent }
        ]);

        expect(prompt).toContain('aaaaaaaa');
        expect(prompt).toContain('[...Truncated for synthesis...]');
        expect(prompt.length).toBeLessThan(longContent.length);
    });

    it('should throw error if no valid responses', () => {
        expect(() => createSynthesisPrompt('test', [])).toThrow('No valid responses');
    });
});
