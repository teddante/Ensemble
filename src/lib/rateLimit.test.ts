import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const limitMock = vi.fn();
const slidingWindowMock = vi.fn();

// Mock @upstash/ratelimit
vi.mock('@upstash/ratelimit', () => {
    return {
        Ratelimit: class {
            constructor() { }
            limit = limitMock;
            static slidingWindow = slidingWindowMock;
        }
    };
});

// Mock @upstash/redis
vi.mock('@upstash/redis', () => {
    return {
        Redis: class {
            constructor() { }
        }
    };
});

// Mock logger
vi.mock('./logger', () => ({
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
    }
}));

describe('rateLimit', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        limitMock.mockReset();
        // Reset env
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should skip rate limiting if Redis env vars are missing', async () => {
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        // Re-import module to trigger top-level conditional logic
        const { checkRateLimit: check } = await import('./rateLimit');

        const result = await check('test-id');

        expect(result.success).toBe(true);
        expect(limitMock).not.toHaveBeenCalled();
    });

    // Note: Testing the "Redis configured" case is tricky because the module initializes `ratelimit` 
    // at the top level based on env vars present at IMPORT time. 
    // Vitest's vi.mock and dynamic imports helps, but we might need to rely on the module re-evaluation.
});
