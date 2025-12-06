import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, getClientIdentifier } from './rateLimit';

describe('RateLimiter', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        if (limiter) {
            limiter.destroy();
        }
        vi.useRealTimers();
    });

    describe('Token Bucket Initialization', () => {
        it('should start new buckets with max tokens', async () => {
            limiter = new RateLimiter(10, 1);

            const result = await limiter.check('test-client');

            expect(result.success).toBe(true);
            expect(result.remaining).toBe(9); // 10 - 1 consumed
        });

        it('should use provided maxTokens and refillRate', async () => {
            limiter = new RateLimiter(5, 0.5);

            // Consume all 5 tokens
            for (let i = 0; i < 5; i++) {
                await limiter.check('test-client');
            }

            const result = await limiter.check('test-client');
            expect(result.success).toBe(false);
            expect(result.remaining).toBe(0);
        });
    });

    describe('Token Consumption', () => {
        it('should decrement tokens on each check', async () => {
            limiter = new RateLimiter(10, 1);

            const result1 = await limiter.check('test-client');
            expect(result1.remaining).toBe(9);

            const result2 = await limiter.check('test-client');
            expect(result2.remaining).toBe(8);

            const result3 = await limiter.check('test-client');
            expect(result3.remaining).toBe(7);
        });

        it('should track different clients separately', async () => {
            limiter = new RateLimiter(3, 1);

            await limiter.check('client-a');
            await limiter.check('client-a');
            const resultA = await limiter.check('client-a');
            expect(resultA.remaining).toBe(0);

            const resultB = await limiter.check('client-b');
            expect(resultB.remaining).toBe(2);
        });
    });

    describe('Token Refill Logic', () => {
        it('should refill tokens over time', async () => {
            limiter = new RateLimiter(10, 1); // 1 token per second

            // Consume 5 tokens
            for (let i = 0; i < 5; i++) {
                await limiter.check('test-client');
            }
            let result = await limiter.check('test-client');
            expect(result.remaining).toBe(4);

            // Advance 3 seconds (should refill 3 tokens)
            vi.advanceTimersByTime(3000);

            result = await limiter.check('test-client');
            // 4 + 3 refilled - 1 consumed = 6
            expect(result.remaining).toBe(6);
        });

        it('should not exceed maxTokens when refilling', async () => {
            limiter = new RateLimiter(10, 1);

            // Consume 1 token
            await limiter.check('test-client');

            // Advance a long time
            vi.advanceTimersByTime(1000000);

            const result = await limiter.check('test-client');
            // Should be capped at 10 - 1 = 9
            expect(result.remaining).toBe(9);
        });
    });

    describe('Rate Limiting', () => {
        it('should return success: false when bucket is empty', async () => {
            limiter = new RateLimiter(3, 1);

            await limiter.check('test-client');
            await limiter.check('test-client');
            await limiter.check('test-client');

            const result = await limiter.check('test-client');
            expect(result.success).toBe(false);
            expect(result.remaining).toBe(0);
        });

        it('should calculate correct retryAfter time', async () => {
            limiter = new RateLimiter(1, 1); // 1 token, 1 token/second

            await limiter.check('test-client');
            const result = await limiter.check('test-client');

            expect(result.success).toBe(false);
            expect(result.retryAfter).toBe(1); // 1 second until next token
        });

        it('should allow requests after refill', async () => {
            limiter = new RateLimiter(1, 1);

            await limiter.check('test-client');
            let result = await limiter.check('test-client');
            expect(result.success).toBe(false);

            // Wait for refill
            vi.advanceTimersByTime(1500);

            result = await limiter.check('test-client');
            expect(result.success).toBe(true);
        });
    });

    describe('Cleanup', () => {
        it('should cleanup expired buckets', async () => {
            limiter = new RateLimiter(10, 1);

            // Create a bucket
            await limiter.check('test-client');

            // Access internal buckets via check - this test verifies cleanup doesn't break functionality
            // Advance past cleanup interval (60s) + bucket expiry time
            vi.advanceTimersByTime(120000);

            // After cleanup, a new check should create a fresh bucket
            const result = await limiter.check('test-client');
            expect(result.success).toBe(true);
            expect(result.remaining).toBe(9); // Fresh bucket
        });
    });

    describe('reset()', () => {
        it('should remove a specific client bucket', async () => {
            limiter = new RateLimiter(10, 1);

            // Consume some tokens
            await limiter.check('test-client');
            await limiter.check('test-client');
            await limiter.check('test-client');

            // Reset the bucket
            limiter.reset('test-client');

            // Should get a fresh bucket
            const result = await limiter.check('test-client');
            expect(result.remaining).toBe(9);
        });
    });

    describe('destroy()', () => {
        it('should clear the cleanup interval', () => {
            limiter = new RateLimiter(10, 1);

            // Spy on clearInterval
            const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

            limiter.destroy();

            expect(clearIntervalSpy).toHaveBeenCalled();
            clearIntervalSpy.mockRestore();
        });

        it('should be safe to call multiple times', () => {
            limiter = new RateLimiter(10, 1);

            expect(() => {
                limiter.destroy();
                limiter.destroy();
            }).not.toThrow();
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
