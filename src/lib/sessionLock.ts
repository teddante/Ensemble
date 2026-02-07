import { redis } from './redis';
import { logger } from './logger';

// Lock TTL in seconds (should match or exceed max generation time)
const LOCK_TTL = 60;

export async function acquireLock(sessionId: string): Promise<boolean> {
    if (!redis) {
        return true;
    }

    const key = `session_lock:${sessionId}`;

    try {
        const result = await redis.set(key, 'locked', { nx: true, ex: LOCK_TTL });
        return result === 'OK';
    } catch (error) {
        logger.error('Failed to acquire session lock', { error, sessionId });
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
