/**
 * Session Lock Manager for Preventing Concurrent Generation Requests
 * 
 * IMPORTANT: SCALABILITY LIMITATIONS
 * ===================================
 * This implementation uses in-memory storage (Map) which has the following limitations:
 * 
 * 1. NOT DURABLE: Lock state is lost on server restart
 * 2. NOT DISTRIBUTED: Each Edge Function instance has its own Map
 * 3. INEFFECTIVE in multi-instance deployments (Vercel, Cloudflare Workers, etc.)
 * 
 * For production with multiple instances, migrate to a distributed locking solution.
 * 
 * RECOMMENDED: Upstash Redis Distributed Locking
 * ===============================================
 * 1. Install: npm install @upstash/redis
 * 2. Create Upstash Redis database at https://upstash.com
 * 3. Add env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 * 4. Replace this implementation with Redis SET NX pattern:
 * 
 *    import { Redis } from "@upstash/redis";
 *    
 *    const redis = new Redis({
 *      url: process.env.UPSTASH_REDIS_REST_URL!,
 *      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
 *    });
 *    
 *    export async function acquire(sessionId: string, durationMs = 300000): Promise<boolean> {
 *      const result = await redis.set(`lock:${sessionId}`, "1", {
 *        nx: true, // Only set if not exists
 *        px: durationMs, // Expiry in milliseconds
 *      });
 *      return result === "OK";
 *    }
 *    
 *    export async function release(sessionId: string): Promise<void> {
 *      await redis.del(`lock:${sessionId}`);
 *    }
 * 
 * This provides atomic, distributed locking across all instances.
 */

import { hashString } from './utils';

interface LockEntry {
    acquiredAt: number;
    expiresAt: number;
}

export class SessionLockManager {
    private locks: Map<string, LockEntry> = new Map();
    private defaultDuration: number;

    constructor(defaultDurationMs = 5 * 60 * 1000) { // 5 minute default
        this.defaultDuration = defaultDurationMs;

        // Periodic cleanup of expired locks
        if (typeof setInterval !== 'undefined') {
            setInterval(() => this.cleanup(), 30000); // Every 30 seconds
        }
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.locks.entries()) {
            if (now > entry.expiresAt) {
                this.locks.delete(key);
            }
        }
    }

    /**
     * Attempt to acquire a lock for the given session
     * @returns true if lock was acquired, false if already locked
     */
    acquire(sessionId: string, durationMs?: number): boolean {
        const now = Date.now();
        const existing = this.locks.get(sessionId);

        // Check if there's an existing valid lock
        if (existing && now < existing.expiresAt) {
            return false;
        }

        // Acquire lock
        this.locks.set(sessionId, {
            acquiredAt: now,
            expiresAt: now + (durationMs ?? this.defaultDuration),
        });

        return true;
    }

    /**
     * Release a lock for the given session
     */
    release(sessionId: string): void {
        this.locks.delete(sessionId);
    }

    /**
     * Check if a session is currently locked
     */
    isLocked(sessionId: string): boolean {
        const entry = this.locks.get(sessionId);
        if (!entry) return false;

        const now = Date.now();
        if (now > entry.expiresAt) {
            this.locks.delete(sessionId);
            return false;
        }

        return true;
    }

    /**
     * Get remaining lock time in milliseconds
     */
    getRemainingTime(sessionId: string): number {
        const entry = this.locks.get(sessionId);
        if (!entry) return 0;

        const remaining = entry.expiresAt - Date.now();
        return Math.max(0, remaining);
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

