import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted() to create mocks that are available during vi.mock hoisting
const { mocks } = vi.hoisted(() => ({
    mocks: {
        limit: vi.fn(),
    }
}));

// Mock the Upstash modules with proper class constructors
vi.mock('@upstash/ratelimit', () => {
    return {
        Ratelimit: class MockRatelimit {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            static slidingWindow = vi.fn().mockReturnValue({} as any);
            limit = mocks.limit;
        }
    };
});

vi.mock('@upstash/redis', () => {
    return {
        Redis: class MockRedis {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
            constructor(_config: any) { }
        }
    };
});

// Import AFTER mocks are set up
import { RateLimiter, getClientIdentifier } from './rateLimit';

describe('RateLimiter', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset mock implementation
        mocks.limit.mockResolvedValue({
            success: true,
            remaining: 49,
            reset: Date.now() + 60000,
        });
    });

    afterEach(() => {
        if (limiter) {
            limiter.destroy();
        }
    });

    describe('check()', () => {
        it('should return success when rate limit not exceeded', async () => {
            limiter = new RateLimiter(50, 50 / 60);

            const result = await limiter.check('test-client');

            expect(result.success).toBe(true);
            expect(result.remaining).toBeGreaterThanOrEqual(0);
        });

        it('should handle different client identifiers', async () => {
            limiter = new RateLimiter(50, 50 / 60);

            const resultA = await limiter.check('client-a');
            const resultB = await limiter.check('client-b');

            // Both should succeed (mocked)
            expect(resultA.success).toBe(true);
            expect(resultB.success).toBe(true);
        });

        it('should return retryAfter when rate limited', async () => {
            mocks.limit.mockResolvedValueOnce({
                success: false,
                remaining: 0,
                reset: Date.now() + 30000,
            });

            limiter = new RateLimiter(50, 50 / 60);

            const result = await limiter.check('test-client');

            expect(result.success).toBe(false);
            expect(result.remaining).toBe(0);
            expect(result.retryAfter).toBeGreaterThan(0);
        });

        it('should fail open if Redis is unavailable', async () => {
            mocks.limit.mockRejectedValueOnce(new Error('Redis connection failed'));

            limiter = new RateLimiter(50, 50 / 60);

            const result = await limiter.check('test-client');

            // Should fail open (allow request)
            expect(result.success).toBe(true);
            expect(result.remaining).toBe(1);
        });
    });

    describe('destroy()', () => {
        it('should be callable without error', () => {
            limiter = new RateLimiter(10, 1);

            expect(() => limiter.destroy()).not.toThrow();
        });

        it('should be safe to call multiple times', () => {
            limiter = new RateLimiter(10, 1);

            expect(() => {
                limiter.destroy();
                limiter.destroy();
            }).not.toThrow();
        });
    });

    describe('reset()', () => {
        it('should be callable without error', () => {
            limiter = new RateLimiter(10, 1);

            expect(() => limiter.reset('test-client')).not.toThrow();
        });
    });
});

describe('getClientIdentifier', () => {
    it('should extract IP from x-forwarded-for header', () => {
        const request = new Request('http://localhost', {
            headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
        });

        const result = getClientIdentifier(request);
        expect(result).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
        const request = new Request('http://localhost', {
            headers: { 'x-real-ip': '10.20.30.40' },
        });

        const result = getClientIdentifier(request);
        expect(result).toBe('10.20.30.40');
    });

    it('should prefer x-forwarded-for over x-real-ip', () => {
        const request = new Request('http://localhost', {
            headers: {
                'x-forwarded-for': '192.168.1.1',
                'x-real-ip': '10.20.30.40',
            },
        });

        const result = getClientIdentifier(request);
        expect(result).toBe('192.168.1.1');
    });

    it('should fall back to user-agent hash when no IP headers', () => {
        const request = new Request('http://localhost', {
            headers: { 'user-agent': 'TestBrowser/1.0' },
        });

        const result = getClientIdentifier(request);
        expect(result).toMatch(/^ua-[a-z0-9]+$/);
    });

    it('should handle missing user-agent', () => {
        const request = new Request('http://localhost');

        const result = getClientIdentifier(request);
        expect(result).toMatch(/^ua-[a-z0-9]+$/);
    });
});
