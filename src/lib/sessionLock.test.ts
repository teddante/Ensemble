import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted() to create mocks that are available during vi.mock hoisting
const { mocks } = vi.hoisted(() => ({
    mocks: {
        set: vi.fn(),
        del: vi.fn(),
        exists: vi.fn(),
        ttl: vi.fn(),
    }
}));

// Mock the Upstash Redis module with proper class constructor
vi.mock('@upstash/redis', () => {
    return {
        Redis: class MockRedis {
            set = mocks.set;
            del = mocks.del;
            exists = mocks.exists;
            ttl = mocks.ttl;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
            constructor(_config: any) { }
        }
    };
});

// Import AFTER mocks are set up
import { SessionLockManager, getSessionIdentifier } from './sessionLock';

describe('SessionLockManager', () => {
    let lockManager: SessionLockManager;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset mock implementations
        mocks.set.mockResolvedValue('OK');
        mocks.del.mockResolvedValue(1);
        mocks.exists.mockResolvedValue(0);
        mocks.ttl.mockResolvedValue(-2);
    });

    afterEach(() => {
        if (lockManager) {
            lockManager.destroy();
        }
    });

    describe('acquire()', () => {
        it('should return true when lock is acquired successfully', async () => {
            lockManager = new SessionLockManager(60000);

            const result = await lockManager.acquire('session-1');
            expect(result).toBe(true);
        });

        it('should return false when lock already exists', async () => {
            mocks.set.mockResolvedValueOnce(null); // NX condition not met

            lockManager = new SessionLockManager(60000);

            const result = await lockManager.acquire('session-1');
            expect(result).toBe(false);
        });

        it('should fail open if Redis is unavailable', async () => {
            mocks.set.mockRejectedValueOnce(new Error('Redis connection failed'));

            lockManager = new SessionLockManager(60000);

            const result = await lockManager.acquire('session-1');
            // Should fail open (allow request)
            expect(result).toBe(true);
        });

        it('should use custom duration when provided', async () => {
            lockManager = new SessionLockManager(60000);

            await lockManager.acquire('session-1', 2000);

            expect(mocks.set).toHaveBeenCalledWith(
                'ensemble:lock:session-1',
                '1',
                { nx: true, px: 2000 }
            );
        });
    });

    describe('release()', () => {
        it('should call Redis del', async () => {
            lockManager = new SessionLockManager(60000);

            await lockManager.release('session-1');

            expect(mocks.del).toHaveBeenCalledWith('ensemble:lock:session-1');
        });

        it('should not throw on Redis error', async () => {
            mocks.del.mockRejectedValueOnce(new Error('Redis error'));

            lockManager = new SessionLockManager(60000);

            await expect(lockManager.release('session-1')).resolves.not.toThrow();
        });
    });

    describe('isLocked()', () => {
        it('should return true when key exists', async () => {
            mocks.exists.mockResolvedValueOnce(1);

            lockManager = new SessionLockManager(60000);

            const result = await lockManager.isLocked('session-1');
            expect(result).toBe(true);
        });

        it('should return false when key does not exist', async () => {
            mocks.exists.mockResolvedValueOnce(0);

            lockManager = new SessionLockManager(60000);

            const result = await lockManager.isLocked('session-1');
            expect(result).toBe(false);
        });

        it('should return false on Redis error', async () => {
            mocks.exists.mockRejectedValueOnce(new Error('Redis error'));

            lockManager = new SessionLockManager(60000);

            const result = await lockManager.isLocked('session-1');
            expect(result).toBe(false);
        });
    });

    describe('getRemainingTime()', () => {
        it('should return remaining time in milliseconds', async () => {
            mocks.ttl.mockResolvedValueOnce(7); // 7 seconds

            lockManager = new SessionLockManager(60000);

            const remaining = await lockManager.getRemainingTime('session-1');
            expect(remaining).toBe(7000); // 7 seconds in ms
        });

        it('should return 0 for non-existent key', async () => {
            mocks.ttl.mockResolvedValueOnce(-2); // Key doesn't exist

            lockManager = new SessionLockManager(60000);

            const remaining = await lockManager.getRemainingTime('session-1');
            expect(remaining).toBe(0);
        });

        it('should return 0 on Redis error', async () => {
            mocks.ttl.mockRejectedValueOnce(new Error('Redis error'));

            lockManager = new SessionLockManager(60000);

            const remaining = await lockManager.getRemainingTime('session-1');
            expect(remaining).toBe(0);
        });
    });

    describe('destroy()', () => {
        it('should be callable without error', () => {
            lockManager = new SessionLockManager(60000);

            expect(() => lockManager.destroy()).not.toThrow();
        });

        it('should be safe to call multiple times', () => {
            lockManager = new SessionLockManager(60000);

            expect(() => {
                lockManager.destroy();
                lockManager.destroy();
            }).not.toThrow();
        });
    });
});

describe('getSessionIdentifier', () => {
    it('should extract session from ensemble_session cookie', () => {
        const request = new Request('http://localhost', {
            headers: { cookie: 'ensemble_session=abc123; other=value' },
        });

        const result = getSessionIdentifier(request);
        expect(result).toBe('abc123');
    });

    it('should fall back to x-forwarded-for IP when no session cookie', () => {
        const request = new Request('http://localhost', {
            headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
        });

        const result = getSessionIdentifier(request);
        expect(result).toBe('ip-192.168.1.1');
    });

    it('should fall back to x-real-ip when no session or forwarded-for', () => {
        const request = new Request('http://localhost', {
            headers: { 'x-real-ip': '10.20.30.40' },
        });

        const result = getSessionIdentifier(request);
        expect(result).toBe('ip-10.20.30.40');
    });

    it('should prefer session cookie over IP headers', () => {
        const request = new Request('http://localhost', {
            headers: {
                cookie: 'ensemble_session=mysession',
                'x-forwarded-for': '192.168.1.1',
            },
        });

        const result = getSessionIdentifier(request);
        expect(result).toBe('mysession');
    });

    it('should fall back to user-agent hash when no identifiers available', () => {
        const request = new Request('http://localhost', {
            headers: { 'user-agent': 'TestBrowser/1.0' },
        });

        const result = getSessionIdentifier(request);
        expect(result).toMatch(/^ua-[a-z0-9]+$/);
    });

    it('should handle completely empty headers', () => {
        const request = new Request('http://localhost');

        const result = getSessionIdentifier(request);
        expect(result).toMatch(/^ua-[a-z0-9]+$/);
    });
});
