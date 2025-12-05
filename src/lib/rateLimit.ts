// Simple token bucket rate limiter for Edge runtime
// Uses in-memory storage - suitable for single-instance deployments

interface Bucket {
    tokens: number;
    lastRefill: number;
}

export class RateLimiter {
    private buckets: Map<string, Bucket> = new Map();
    private maxTokens: number;
    private refillRate: number; // tokens per second
    private cleanupInterval: number;

    constructor(maxTokens = 10, refillRate = 1) {
        this.maxTokens = maxTokens;
        this.refillRate = refillRate;
        this.cleanupInterval = 60000; // Cleanup every minute

        // Periodic cleanup of expired buckets
        if (typeof setInterval !== 'undefined') {
            setInterval(() => this.cleanup(), this.cleanupInterval);
        }
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
    return `ua-${hashCode(ua)}`;
}

function hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}
