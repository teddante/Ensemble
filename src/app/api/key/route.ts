import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/validation';
import { encrypt, decrypt, isEncrypted } from '@/lib/crypto';

export const runtime = 'edge';

const COOKIE_NAME = 'ensemble_api_key';
const CSRF_HEADER = 'x-requested-with';

// CSRF protection: require custom header for state-changing requests
function validateCSRF(request: NextRequest): boolean {
    const header = request.headers.get(CSRF_HEADER);
    return header === 'XMLHttpRequest' || header === 'fetch';
}

export async function GET(request: NextRequest) {
    // CSRF protection for consistency
    if (!validateCSRF(request)) {
        return NextResponse.json(
            { error: 'Invalid request' },
            { status: 403 }
        );
    }

    const cookieStore = await cookies();
    const hasKey = cookieStore.has(COOKIE_NAME);
    return NextResponse.json({ hasKey });
}

export async function POST(request: NextRequest) {
    // CSRF protection
    if (!validateCSRF(request)) {
        return NextResponse.json(
            { error: 'Invalid request' },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();
        const { apiKey } = body;

        const validation = validateApiKey(apiKey);
        if (!validation.isValid) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        // Encrypt the API key before storing
        const encryptedKey = await encrypt(validation.sanitized!);

        const cookieStore = await cookies();

        cookieStore.set(COOKIE_NAME, encryptedKey, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to save API key:', error);
        // Don't leak implementation details
        return NextResponse.json(
            { error: 'Failed to save API key' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    // CSRF protection
    if (!validateCSRF(request)) {
        return NextResponse.json(
            { error: 'Invalid request' },
            { status: 403 }
        );
    }

    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
    return NextResponse.json({ success: true });
}

// Helper to get decrypted API key from cookie
export async function getApiKeyFromCookie(): Promise<string | null> {
    const cookieStore = await cookies();
    const encryptedKey = cookieStore.get(COOKIE_NAME)?.value;

    if (!encryptedKey) {
        return null;
    }

    try {
        // Handle migration from unencrypted to encrypted keys
        if (isEncrypted(encryptedKey)) {
            return await decrypt(encryptedKey);
        } else {
            // Legacy unencrypted key - return as-is (will be re-encrypted on next save)
            return encryptedKey;
        }
    } catch (error) {
        console.error('Failed to decrypt API key:', error);
        return null;
    }
}

