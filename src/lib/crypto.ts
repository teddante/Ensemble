// Encryption utilities for API key storage
// Uses Web Crypto API (available in Edge runtime)

import { ENCRYPTION_MAGIC_PREFIX } from './constants';

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 128;

// Get encryption key from environment
function getEncryptionKey(): string {
    const key = process.env.COOKIE_ENCRYPTION_KEY;

    if (!key) {
        throw new Error(
            'COOKIE_ENCRYPTION_KEY environment variable is required.\n' +
            'Generate one with: openssl rand -base64 32'
        );
    }

    if (key.length < 32) {
        throw new Error('COOKIE_ENCRYPTION_KEY must be at least 32 characters');
    }

    return key;
}

// Derive a CryptoKey from the string key
async function deriveKey(keyString: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    // Derive stable 256-bit key material from the full secret.
    const keyMaterial = encoder.encode(keyString);
    const digest = await crypto.subtle.digest('SHA-256', keyMaterial);

    const rawKey = await crypto.subtle.importKey(
        'raw',
        digest,
        { name: ALGORITHM },
        false,
        ['encrypt', 'decrypt']
    );

    return rawKey;
}

/**
 * Encrypt a string value
 * @param plaintext - The value to encrypt
 * @returns Base64-encoded ciphertext with IV prepended
 */
export async function encrypt(plaintext: string): Promise<string> {
    const key = await deriveKey(getEncryptionKey());
    const encoder = new TextEncoder();

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encrypt
    const plaintextBytes = encoder.encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
        key,
        plaintextBytes
    );

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Base64 encode for storage with magic prefix
    return ENCRYPTION_MAGIC_PREFIX + btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a previously encrypted value
 * @param ciphertext - Base64-encoded ciphertext with IV prepended
 * @returns Decrypted plaintext
 */
export async function decrypt(ciphertext: string): Promise<string> {
    const key = await deriveKey(getEncryptionKey());
    const decoder = new TextDecoder();

    if (!ciphertext.startsWith(ENCRYPTION_MAGIC_PREFIX)) {
        throw new Error('Invalid encrypted value format');
    }

    // Strip magic prefix and decode from base64
    const base64Data = ciphertext.slice(ENCRYPTION_MAGIC_PREFIX.length);
    const combined = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Extract IV and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const encryptedData = combined.slice(IV_LENGTH);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
        key,
        encryptedData
    );

    return decoder.decode(plaintext);
}

