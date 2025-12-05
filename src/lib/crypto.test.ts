import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the crypto subtle API for testing
const mockSubtle = {
    importKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
};

const mockCrypto = {
    subtle: mockSubtle,
    getRandomValues: vi.fn((arr: Uint8Array) => {
        // Fill with predictable values for testing
        for (let i = 0; i < arr.length; i++) {
            arr[i] = i % 256;
        }
        return arr;
    }),
};

// Store original crypto
const originalCrypto = global.crypto;

describe('Crypto Module', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        // Mock global crypto
        Object.defineProperty(global, 'crypto', {
            value: mockCrypto,
            writable: true,
        });
    });

    afterEach(() => {
        // Restore original crypto
        Object.defineProperty(global, 'crypto', {
            value: originalCrypto,
            writable: true,
        });
    });

    describe('isEncrypted', () => {
        it('should return true for values with ENS: prefix', async () => {
            // Reset modules to get fresh import
            vi.resetModules();

            // Set env var
            vi.stubEnv('COOKIE_ENCRYPTION_KEY', 'test-key-that-is-at-least-32-characters-long');

            const { isEncrypted } = await import('./crypto');

            expect(isEncrypted('ENS:somebase64encrypteddata')).toBe(true);
        });

        it('should return false for values without ENS: prefix', async () => {
            vi.resetModules();
            vi.stubEnv('COOKIE_ENCRYPTION_KEY', 'test-key-that-is-at-least-32-characters-long');

            const { isEncrypted } = await import('./crypto');

            expect(isEncrypted('somebase64data')).toBe(false);
            expect(isEncrypted('sk-or-v1-testkey')).toBe(false);
            expect(isEncrypted('')).toBe(false);
        });
    });

    describe('encrypt/decrypt', () => {
        it('should throw error if COOKIE_ENCRYPTION_KEY is not set', async () => {
            vi.resetModules();
            vi.stubEnv('COOKIE_ENCRYPTION_KEY', '');

            const { encrypt } = await import('./crypto');

            await expect(encrypt('test-plaintext')).rejects.toThrow('COOKIE_ENCRYPTION_KEY environment variable is required');
        });

        it('should throw error if key is too short', async () => {
            vi.resetModules();
            vi.stubEnv('COOKIE_ENCRYPTION_KEY', 'short');

            const { encrypt } = await import('./crypto');

            await expect(encrypt('test-plaintext')).rejects.toThrow('must be at least 32 characters');
        });
    });

    describe('ENCRYPTION_MAGIC_PREFIX', () => {
        it('should be exported from constants', async () => {
            const { ENCRYPTION_MAGIC_PREFIX } = await import('./constants');
            expect(ENCRYPTION_MAGIC_PREFIX).toBe('ENS:');
        });
    });
});
