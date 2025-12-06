import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionLockManager, getSessionIdentifier } from './sessionLock';

describe('SessionLockManager', () => {
    let lockManager: SessionLockManager;

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        if (lockManager) {
            lockManager.destroy();
        }
        vi.useRealTimers();
    });

    describe('Lock Acquisition', () => {
        it('should acquire lock for new session', () => {
            lockManager = new SessionLockManager(60000);

            const result = lockManager.acquire('session-1');
            expect(result).toBe(true);
        });

        it('should allow multiple different sessions to acquire locks', () => {
            lockManager = new SessionLockManager(60000);

            expect(lockManager.acquire('session-1')).toBe(true);
            expect(lockManager.acquire('session-2')).toBe(true);
            expect(lockManager.acquire('session-3')).toBe(true);
        });
    });

    describe('Lock Rejection', () => {
        it('should reject lock acquisition when session is already locked', () => {
            lockManager = new SessionLockManager(60000);

            lockManager.acquire('session-1');
            const result = lockManager.acquire('session-1');

            expect(result).toBe(false);
        });

        it('should allow lock after explicit release', () => {
            lockManager = new SessionLockManager(60000);

            lockManager.acquire('session-1');
            lockManager.release('session-1');

            const result = lockManager.acquire('session-1');
            expect(result).toBe(true);
        });
    });

    describe('Lock Expiry', () => {
        it('should allow lock acquisition after lock expires', () => {
            lockManager = new SessionLockManager(5000); // 5 second lock

            lockManager.acquire('session-1');

            // Advance past expiry
            vi.advanceTimersByTime(6000);

            const result = lockManager.acquire('session-1');
            expect(result).toBe(true);
        });

        it('should reject lock before expiry', () => {
            lockManager = new SessionLockManager(10000); // 10 second lock

            lockManager.acquire('session-1');

            // Advance less than expiry
            vi.advanceTimersByTime(5000);

            const result = lockManager.acquire('session-1');
            expect(result).toBe(false);
        });

        it('should use custom duration when provided', () => {
            lockManager = new SessionLockManager(60000);

            lockManager.acquire('session-1', 2000); // 2 second custom duration

            vi.advanceTimersByTime(2500);

            const result = lockManager.acquire('session-1');
            expect(result).toBe(true);
        });
    });

    describe('release()', () => {
        it('should release an acquired lock', () => {
            lockManager = new SessionLockManager(60000);

            lockManager.acquire('session-1');
            expect(lockManager.isLocked('session-1')).toBe(true);

            lockManager.release('session-1');
            expect(lockManager.isLocked('session-1')).toBe(false);
        });

        it('should be safe to release non-existent lock', () => {
            lockManager = new SessionLockManager(60000);

            expect(() => {
                lockManager.release('non-existent');
            }).not.toThrow();
        });
    });

    describe('isLocked()', () => {
        it('should return true for locked session', () => {
            lockManager = new SessionLockManager(60000);

            lockManager.acquire('session-1');
            expect(lockManager.isLocked('session-1')).toBe(true);
        });

        it('should return false for unlocked session', () => {
            lockManager = new SessionLockManager(60000);

            expect(lockManager.isLocked('session-1')).toBe(false);
        });

        it('should return false after lock expires and cleanup entry', () => {
            lockManager = new SessionLockManager(5000);

            lockManager.acquire('session-1');
            vi.advanceTimersByTime(6000);

            expect(lockManager.isLocked('session-1')).toBe(false);
        });
    });

    describe('getRemainingTime()', () => {
        it('should return correct remaining time', () => {
            lockManager = new SessionLockManager(10000);

            lockManager.acquire('session-1');
            vi.advanceTimersByTime(3000);

            const remaining = lockManager.getRemainingTime('session-1');
            expect(remaining).toBe(7000); // 10000 - 3000
        });

        it('should return 0 for non-existent session', () => {
            lockManager = new SessionLockManager(60000);

            const remaining = lockManager.getRemainingTime('non-existent');
            expect(remaining).toBe(0);
        });

        it('should return 0 after lock expires', () => {
            lockManager = new SessionLockManager(5000);

            lockManager.acquire('session-1');
            vi.advanceTimersByTime(6000);

            const remaining = lockManager.getRemainingTime('session-1');
            expect(remaining).toBe(0);
        });
    });

    describe('Cleanup', () => {
        it('should cleanup expired locks during periodic cleanup', () => {
            lockManager = new SessionLockManager(5000);

            lockManager.acquire('session-1');

            // Advance past lock expiry and cleanup interval (30s)
            vi.advanceTimersByTime(35000);

            // The lock should be expired and cleaned up
            const result = lockManager.acquire('session-1');
            expect(result).toBe(true);
        });
    });

    describe('destroy()', () => {
        it('should clear the cleanup interval', () => {
            lockManager = new SessionLockManager(60000);

            const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

            lockManager.destroy();

            expect(clearIntervalSpy).toHaveBeenCalled();
            clearIntervalSpy.mockRestore();
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
