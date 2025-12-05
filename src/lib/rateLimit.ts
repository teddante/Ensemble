/**
 * Token Bucket Rate Limiter for Edge Runtime
 * 
 * IMPORTANT: SCALABILITY LIMITATIONS
 * ===================================
 * This implementation uses in-memory storage (Map) which has the following limitations:
 * 
 * 1. NOT DURABLE: Rate limit state is lost on server restart
 * 2. NOT DISTRIBUTED: Each Edge Function instance has its own Map
 * 3. INEFFECTIVE in multi-instance deployments (Vercel, Cloudflare Workers, etc.)
 * 
 * For production with multiple instances, migrate to a distributed solution.
 * 
 * RECOMMENDED: Upstash Redis Rate Limiting
 * =========================================
 * 1. Install: npm install @upstash/ratelimit @upstash/redis
 * 2. Create Upstash Redis database at https://upstash.com
 * 3. Add env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 * 4. Replace this implementation with:
 * 
 *    import { Ratelimit } from "@upstash/ratelimit";
 *    import { Redis } from "@upstash/redis";
 *    
 *    const redis = new Redis({
 *      url: process.env.UPSTASH_REDIS_REST_URL!,
 *      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
 *    });
 *    
 *    export const generateRateLimiter = new Ratelimit({
 *      redis,
 *      limiter: Ratelimit.slidingWindow(10, "1 m"),
 *      analytics: true,
 *    });
 * 
 * The Upstash Ratelimit API is similar to this implementation's check() method.
 */

import { hashString } from './utils';

interface Bucket {
    tokens: number;
    lastRefill: number;
}

export class RateLimiter {
    private buckets: Map<string, Bucket> = new Map();
    private maxTokens: number;
    private refillRate: number; // tokens per second
    private cleanupIntervalMs: number;
    private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

    constructor(maxTokens = 10, refillRate = 1) {
        this.maxTokens = maxTokens;
        this.refillRate = refillRate;
        this.cleanupIntervalMs = 60000; // Cleanup every minute

        // Periodic cleanup of expired buckets
        if (typeof setInterval !== 'undefined') {
            this.cleanupIntervalId = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
        }
    }

    /**
     * Destroy the rate limiter and clear cleanup interval
     * Call this when shutting down the server gracefully
     */
    destroy(): void {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            this.cleanupIntervalId = null;
        }
        this.buckets.clear();
    }

    private cleanup(): void {
        const now = Date.now();
        const maxAge = (this.maxTokens / this.refillRate) * 1000 * 2; // 2x time to full refill

        for (const [key, bucket] of this.buckets.entries()) {
            if (now - bucket.lastRefill > maxAge) {
                this.buckets.delete(key);
            }
        }
    }

    private refillBucket(bucket: Bucket): Bucket {
        const now = Date.now();
        const timePassed = (now - bucket.lastRefill) / 1000;
        const tokensToAdd = timePassed * this.refillRate;

        return {
            tokens: Math.min(this.maxTokens, bucket.tokens + tokensToAdd),
            lastRefill: now,
        };
    }

    async check(identifier: string): Promise<{ success: boolean; remaining: number; retryAfter?: number }> {
        let bucket = this.buckets.get(identifier);

        if (!bucket) {
            bucket = { tokens: this.maxTokens, lastRefill: Date.now() };
        } else {
            bucket = this.refillBucket(bucket);
        }

        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            this.buckets.set(identifier, bucket);
            return { success: true, remaining: Math.floor(bucket.tokens) };
        }

        // Calculate time until next token is available
        const retryAfter = Math.ceil((1 - bucket.tokens) / this.refillRate);
        this.buckets.set(identifier, bucket);

        return { success: false, remaining: 0, retryAfter };
    }

    reset(identifier: string): void {
        this.buckets.delete(identifier);
    }
}

// Global rate limiter instances
// Generate: 10 requests per minute (refill 1 every 6 seconds)
export const generateRateLimiter = new RateLimiter(10, 1 / 6);

// Key management: 5 requests per minute
export const keyRateLimiter = new RateLimiter(5, 1 / 12);

// Models list: 20 requests per minute
export const modelsRateLimiter = new RateLimiter(20, 1 / 3);

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

