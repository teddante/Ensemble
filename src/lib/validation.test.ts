import { describe, it, expect } from 'vitest';
import { validatePrompt, validateApiKey, validateModels } from './validation';

describe('Validation Utilities', () => {
    describe('validatePrompt', () => {
        it('should validate a correct prompt', () => {
            const result = validatePrompt('Hello world');
            expect(result.isValid).toBe(true);
            expect(result.sanitized).toBe('Hello world');
        });

        it('should fail on empty prompt', () => {
            const result = validatePrompt('');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Prompt is required');
        });

        it('should fail on whitespace only', () => {
            const result = validatePrompt('   ');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Prompt cannot be empty');
        });

        it('should allow code snippets (script tags)', () => {
            // We relaxed this rule, so it should be valid now
            const code = '<script>alert("test")</script>';
            const result = validatePrompt(code);
            expect(result.isValid).toBe(true);
            expect(result.sanitized).toBe(code);
        });
    });

    describe('validateApiKey', () => {
        it('should validate a correct API key', () => {
            const result = validateApiKey('sk-or-v1-abcdef123456');
            expect(result.isValid).toBe(true);
        });

        it('should fail on empty key', () => {
            const result = validateApiKey('');
            expect(result.isValid).toBe(false);
        });

        it('should fail if not starting with sk-', () => {
            const result = validateApiKey('invalid-key');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('start with "sk-"');
        });
    });

    describe('validateModels', () => {
        it('should validate correct models', () => {
            const result = validateModels(['openai/gpt-4', 'anthropic/claude-3']);
            expect(result.isValid).toBe(true);
        });

        it('should fail on empty array', () => {
            const result = validateModels([]);
            expect(result.isValid).toBe(false);
        });

        it('should fail on invalid model format', () => {
            const result = validateModels(['invalid model']);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Invalid model format');
        });
    });
});
