import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis';
import { logger } from './logger';

// Create a new ratelimiter, that allows 10 requests per 10 seconds
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

async function hashIdentifier(identifier: string): Promise<string> {
    const input = new TextEncoder().encode(identifier);
    const digest = await crypto.subtle.digest('SHA-256', input);
    const hashBytes = new Uint8Array(digest);
    return Array.from(hashBytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
    if (!ratelimit) {
        logger.debug('Rate limiting skipped: Redis not configured');
        return {
            success: true,
            limit: 10,
            remaining: 10,
            reset: 0,
        };
    }

    try {
        const hashedIdentifier = await hashIdentifier(identifier);
        const { success, limit, remaining, reset } = await ratelimit.limit(`api_key:${hashedIdentifier}`);
        return { success, limit, remaining, reset };
    } catch (error) {
        logger.error('Rate limit check failed', { error });
        return {
            success: true,
            limit: 10,
            remaining: 10,
            reset: 0,
        };
    }
}
