import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { handleOpenRouterError, AppError } from './errors';

describe('handleOpenRouterError', () => {
    // Save original NODE_ENV of the test process
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
        // Default to production for all tests unless specified otherwise
        // @ts-expect-error -- env is read-only
        process.env.NODE_ENV = 'production';
    });

    afterAll(() => {
        // @ts-expect-error -- env is read-only
        process.env.NODE_ENV = originalEnv;
    });

    it('should return raw error message in development environment', () => {
        // @ts-expect-error -- env is read-only
        process.env.NODE_ENV = 'development';
        const error = new Error('Raw error message');
        expect(handleOpenRouterError(error)).toBe('Raw error message');
    });

    it('should return AppError message', () => {
        const error = new AppError('Custom app error', 400);
        expect(handleOpenRouterError(error)).toBe('Custom app error');
    });

    describe('OpenRouter Error Mappings', () => {
        it('should handle 401/Unauthorized errors', () => {
            expect(handleOpenRouterError(new Error('401 Unauthorized'))).toBe('Invalid API key. Please check your settings.');
            expect(handleOpenRouterError(new Error('Invalid API Key provided'))).toBe('Invalid API key. Please check your settings.');
        });

        it('should handle 402/Credit errors', () => {
            expect(handleOpenRouterError(new Error('402 Payment Required'))).toBe('Insufficient OpenRouter credits. Please top up your account.');
            expect(handleOpenRouterError(new Error('Insufficient credits'))).toBe('Insufficient OpenRouter credits. Please top up your account.');
        });

        it('should handle 403/Forbidden errors', () => {
            expect(handleOpenRouterError(new Error('403 Forbidden'))).toBe('Request blocked by moderation filter or access denied.');
            expect(handleOpenRouterError(new Error('Moderation flag triggered'))).toBe('Request blocked by moderation filter or access denied.');
        });

        it('should handle 404/Not Found errors', () => {
            expect(handleOpenRouterError(new Error('404 Not Found'))).toBe('The selected model is currently unavailable or does not exist.');
            expect(handleOpenRouterError(new Error('Model does not exist'))).toBe('The selected model is currently unavailable or does not exist.');
        });

        it('should handle 408/Timeout errors', () => {
            expect(handleOpenRouterError(new Error('408 Request Timeout'))).toBe('The request timed out. Please try again.');
        });

        it('should handle 429/Rate Limit errors', () => {
            expect(handleOpenRouterError(new Error('429 Too Many Requests'))).toBe('Rate limit exceeded. Please wait a moment before trying again.');
        });

        it('should handle 502/503 Provider errors', () => {
            expect(handleOpenRouterError(new Error('502 Bad Gateway'))).toBe('The AI provider is currently experiencing issues. Please try a different model.');
            expect(handleOpenRouterError(new Error('503 Service Unavailable'))).toBe('The AI provider is currently experiencing issues. Please try a different model.');
        });

        it('should handle 524 Cloudflare Timeout errors', () => {
            expect(handleOpenRouterError(new Error('524 A timeout occurred'))).toBe('The AI provider timed out. The model might be overloaded.');
        });
    });

    it('should pass through safe messages', () => {
        // @ts-expect-error -- env is read-only
        process.env.NODE_ENV = 'production';
        expect(handleOpenRouterError(new Error('Request cancelled'))).toBe('Request cancelled');
        expect(handleOpenRouterError(new Error('Model not available'))).toBe('Model not available');
    });

    it('should return generic error for unknown errors', () => {
        // @ts-expect-error -- env is read-only
        process.env.NODE_ENV = 'production';
        expect(handleOpenRouterError(new Error('Random unknown error'))).toBe('An error occurred while processing your request. Please try again later.');
    });
});
