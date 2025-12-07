/**
 * Distributed Session Lock Manager using Upstash Redis
 * 
 * Provides robust locking across serverless/Edge instances to prevent
 * concurrent generation requests for the same session.
 */

import { Redis } from '@upstash/redis';
import { hashString } from './utils';

// Initialize Redis client
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export class SessionLockManager {
    private defaultDuration: number;

    constructor(defaultDurationMs = 5 * 60 * 1000) { // 5 minute default
        this.defaultDuration = defaultDurationMs;
    }

    // No-op for API compatibility
    destroy(): void { }

    /**
     * Attempt to acquire a lock for the given session using Redis SET NX
     * @returns true if lock was acquired, false if already locked
     */
    async acquire(sessionId: string, durationMs?: number): Promise<boolean> {
        try {
            const key = `ensemble:lock:${sessionId}`;
            const duration = durationMs ?? this.defaultDuration;

            // SET key "1" NX PX duration
            // NX: Only set if not exists
            // PX: Expiry in milliseconds
            const result = await redis.set(key, "1", {
                nx: true,
                px: duration,
            });

            return result === "OK";
        } catch (error) {
            console.error('Session lock acquire failed:', error);
            // Fail open if Redis is down (allow request) behavior is debatable, 
            // but failing closed (blocking user) is worse for UX during outage.
            // However, failing open risks data corruption.
            // Given this is a UX feature to prevent confused history, failing open is safer options.
            return true;
        }
    }

    /**
     * Release a lock for the given session
     */
    async release(sessionId: string): Promise<void> {
        try {
            const key = `ensemble:lock:${sessionId}`;
            await redis.del(key);
        } catch (error) {
            console.error('Session lock release failed:', error);
        }
    }

    /**
     * Check if a session is currently locked
     */
    async isLocked(sessionId: string): Promise<boolean> {
        try {
            const key = `ensemble:lock:${sessionId}`;
            const exists = await redis.exists(key);
            return exists === 1;
        } catch (_error) {
            return false;
        }
    }

    /**
     * Get remaining lock time in milliseconds
     * Note: Redis TTL command returns seconds
     */
    async getRemainingTime(sessionId: string): Promise<number> {
        try {
            const key = `ensemble:lock:${sessionId}`;
            const ttlSeconds = await redis.ttl(key);

            if (ttlSeconds < 0) return 0; // -1 (no expiry) or -2 (not found)

            return ttlSeconds * 1000;
        } catch (_error) {
            return 0;
        }
    }
}

// Global session lock manager for generation requests
export const generationLock = new SessionLockManager();

// Helper to get session identifier from request
export function getSessionIdentifier(request: Request): string {
    // Try to get session from cookie or create from IP
    const cookies = request.headers.get('cookie') || '';
    const sessionMatch = cookies.match(/ensemble_session=([^;]+)/);

    if (sessionMatch) {
        return sessionMatch[1];
    }

    // Fallback to IP-based identifier
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return `ip-${forwarded.split(',')[0].trim()}`;
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return `ip-${realIp}`;
    }

    // Last resort: user-agent hash
    const ua = request.headers.get('user-agent') || 'unknown';
    return `ua-${hashString(ua)}`;
}
