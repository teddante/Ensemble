import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis client methods
const setMock = vi.fn();
const delMock = vi.fn();

// Mock @upstash/redis
vi.mock('@upstash/redis', () => {
    return {
        Redis: class {
            constructor() { }
            set = setMock;
            del = delMock;
        }
    };
});

describe('sessionLock', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        setMock.mockReset();
        delMock.mockReset();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should acquire lock successfully when Redis returns OK', async () => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://fake-url.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

        setMock.mockResolvedValue('OK');

        const { acquireLock } = await import('./sessionLock');
        const success = await acquireLock('session-123');

        expect(success).toBe(true);
        expect(setMock).toHaveBeenCalledWith(
            'session_lock:session-123',
            'locked',
            expect.objectContaining({ nx: true, ex: 60 })
        );
    });

    it('should fail to acquire lock when Redis returns null (already locked)', async () => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://fake-url.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

        setMock.mockResolvedValue(null);

        const { acquireLock } = await import('./sessionLock');
        const success = await acquireLock('session-123');

        expect(success).toBe(false);
    });

    it('should default to true (allow) if Redis is not configured', async () => {
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        const { acquireLock } = await import('./sessionLock');
        const success = await acquireLock('session-123');

        expect(success).toBe(true);
        expect(setMock).not.toHaveBeenCalled();
    });

    it('should release lock', async () => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://fake-url.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

        delMock.mockResolvedValue(1);

        const { releaseLock } = await import('./sessionLock');
        await releaseLock('session-123');

        expect(delMock).toHaveBeenCalledWith('session_lock:session-123');
    });
});
