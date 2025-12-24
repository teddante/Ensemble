import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from './logger';

// Create a new ratelimiter, that allows 10 requests per 10 seconds
// checking the validity of the Environment variables first
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

let ratelimit: Ratelimit | null = null;

if (redis) {
    ratelimit = new Ratelimit({
        redis: redis,
        limiter: Ratelimit.slidingWindow(10, '10 s'),
        analytics: true,
        prefix: '@upstash/ratelimit',
    });
}

export type RateLimitResult = {
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
};

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
    if (!ratelimit) {
        // If Redis is not configured, we don't rate limit
        // logging only once or sparingly would be better but for now:
        logger.debug('Rate limiting skipped: Redis not configured');
        return {
            success: true,
            limit: 10,
            remaining: 10,
            reset: 0,
        };
    }

    try {
        const { success, limit, remaining, reset } = await ratelimit.limit(identifier);
        return { success, limit, remaining, reset };
    } catch (error) {
        logger.error('Rate limit check failed', { error });
        // Fail open if rate limiter fails
        return {
            success: true,
            limit: 10,
            remaining: 10,
            reset: 0,
        };
    }
}
