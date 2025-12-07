import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { GENERATE_RATE_LIMIT, KEY_RATE_LIMIT, MODELS_RATE_LIMIT } from './constants';
import { hashString } from './utils';

// Initialize Redis client
// We use a lazy initialization pattern or global singleton to ensure connection reuse
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

/**
 * Wrapper for Upstash Ratelimit to maintain existing API compatibility
 */
export class RateLimiter {
    private limiter: Ratelimit;

    constructor(maxTokens: number, refillRate: number) {
        // Convert refillRate (tokens/sec) to window duration
        // Upstash uses sliding window. 
        // If refillRate is 1 token/sec, and maxTokens is 10, 
        // we can approximate this as a window of "maxTokens" requests every "maxTokens/refillRate" seconds
        // But simpler is: X requests per 60s

        // Example: 50 requests per minute
        // maxTokens = 50, window = 1 minute

        const windowSeconds = maxTokens / refillRate;

        this.limiter = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(maxTokens, `${Math.ceil(windowSeconds)} s` as any),
            analytics: true,
            prefix: 'ensemble:ratelimit',
        });
    }

    /**
     * Check if request is allowed
     */
    async check(identifier: string): Promise<{ success: boolean; remaining: number; retryAfter?: number }> {
        try {
            const result = await this.limiter.limit(identifier);

            return {
                success: result.success,
                remaining: result.remaining,
                retryAfter: result.reset ? Math.ceil((result.reset - Date.now()) / 1000) : undefined
            };
        } catch (error) {
            console.error('Rate limit check failed:', error);
            // Fail open if Redis is down
            return { success: true, remaining: 1 };
        }
    }

    // No-op for API compatibility
    destroy(): void { }
    reset(identifier: string): void { }
}

// Generate: 50 requests per minute
export const generateRateLimiter = new RateLimiter(GENERATE_RATE_LIMIT, GENERATE_RATE_LIMIT / 60);

// Key management: 20 requests per minute
export const keyRateLimiter = new RateLimiter(KEY_RATE_LIMIT, KEY_RATE_LIMIT / 60);

// Models list: 50 requests per minute
export const modelsRateLimiter = new RateLimiter(MODELS_RATE_LIMIT, MODELS_RATE_LIMIT / 60);

// Helper to get client identifier from request
export function getClientIdentifier(request: Request): string {
    // Try various headers for client IP
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return realIp;
    }

    // Fallback to a hash of user-agent + some other identifying info
    const ua = request.headers.get('user-agent') || 'unknown';
    return `ua-${hashString(ua)}`;
}
