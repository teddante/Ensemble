import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/validation';
import { encrypt, decrypt } from '@/lib/crypto';
import { withCSRF, errorResponse } from '@/lib/apiSecurity';

export const runtime = 'edge';

const COOKIE_NAME = 'ensemble_api_key';

export const GET = withCSRF(async (_request: NextRequest) => {
    const cookieStore = await cookies();
    const hasKey = cookieStore.has(COOKIE_NAME);
    return NextResponse.json({ hasKey });
});

export const POST = withCSRF(async (request: NextRequest) => {
    try {
        const body = await request.json();
        const { apiKey } = body;

        const validation = validateApiKey(apiKey);
        if (!validation.isValid) {
            return errorResponse(validation.error!, 400);
        }

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
        return errorResponse('Failed to save API key', 500);
    }
});

export const DELETE = withCSRF(async (_request: NextRequest) => {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
    return NextResponse.json({ success: true });
});

// Helper to get decrypted API key from cookie
export async function getApiKeyFromCookie(): Promise<string | null> {
    const cookieStore = await cookies();
    const encryptedKey = cookieStore.get(COOKIE_NAME)?.value;

    if (!encryptedKey) {
        return null;
    }

    try {
        return await decrypt(encryptedKey);
    } catch (error) {
        console.error('Failed to decrypt API key:', error);
        return null;
    }
}
