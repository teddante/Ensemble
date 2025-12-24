import { Redis } from '@upstash/redis';
import { logger } from './logger';

const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

// Lock TTL in seconds (should match or exceed max generation time)
const LOCK_TTL = 60;

export async function acquireLock(sessionId: string): Promise<boolean> {
    if (!redis) {
        return true; // Use optimistic locking if Redis not configured
    }

    const key = `session_lock:${sessionId}`;

    try {
        // SET NX EX - Set if Not Exists, with Expiryt
        // Returns 1 if set, null if not set (already exists)
        // Upstash/Redis client returns 'OK' for set, null for not set when using options?
        // Actually set(key, val, { nx: true, ex: TTL }) returns "OK" or null.

        const result = await redis.set(key, 'locked', { nx: true, ex: LOCK_TTL });

        if (result === 'OK') {
            return true;
        }

        return false;
    } catch (error) {
        logger.error('Failed to acquire session lock', { error, sessionId });
        // Fail open or closed? 
        // Fail open (allow request) is better for UX if Redis is down
        return true;
    }
}

export async function releaseLock(sessionId: string): Promise<void> {
    if (!redis) return;

    const key = `session_lock:${sessionId}`;

    try {
        await redis.del(key);
    } catch (error) {
        logger.error('Failed to release session lock', { error, sessionId });
    }
}
