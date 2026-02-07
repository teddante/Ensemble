import { Redis } from '@upstash/redis';

/**
 * Shared Redis client for rate limiting and session locking.
 * Returns null if environment variables are not configured.
 */
export const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;
