// Encryption utilities for API key storage
// Uses Web Crypto API (available in Edge runtime)

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 128;

// Get encryption key from environment
function getEncryptionKey(): string {
    const key = process.env.COOKIE_ENCRYPTION_KEY;

    if (!key) {
        // In development, use a default key (NOT SECURE FOR PRODUCTION)
        if (process.env.NODE_ENV === 'development') {
            return 'dev-only-key-not-for-production!';
        }
        throw new Error('COOKIE_ENCRYPTION_KEY environment variable is required in production');
    }

    if (key.length < 32) {
        throw new Error('COOKIE_ENCRYPTION_KEY must be at least 32 characters');
    }

    return key;
}

// Derive a CryptoKey from the string key
async function deriveKey(keyString: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyString.slice(0, 32)); // Use first 32 chars

    const rawKey = await crypto.subtle.importKey(
        'raw',
        keyData,
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

    // Base64 encode for storage
    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a previously encrypted value
 * @param ciphertext - Base64-encoded ciphertext with IV prepended
 * @returns Decrypted plaintext
 */
export async function decrypt(ciphertext: string): Promise<string> {
    const key = await deriveKey(getEncryptionKey());
    const decoder = new TextDecoder();

    // Decode from base64
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

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

/**
 * Check if a value appears to be encrypted (base64 with proper length)
 */
export function isEncrypted(value: string): boolean {
    try {
        const decoded = atob(value);
        // Minimum length: IV (12) + some ciphertext + tag (16)
        return decoded.length >= IV_LENGTH + 16 + 10;
    } catch {
        return false;
    }
}
