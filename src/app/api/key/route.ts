import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/validation';

export const runtime = 'edge';

const COOKIE_NAME = 'ensemble_api_key';

export async function GET() {
    const cookieStore = await cookies();
    const hasKey = cookieStore.has(COOKIE_NAME);
    return NextResponse.json({ hasKey });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { apiKey } = body;

        const validation = validateApiKey(apiKey);
        if (!validation.isValid) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const cookieStore = await cookies();

        cookieStore.set(COOKIE_NAME, validation.sanitized!, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
    }
}

export async function DELETE() {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
    return NextResponse.json({ success: true });
}
