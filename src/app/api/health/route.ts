import { NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * Health check endpoint for load balancers and monitoring
 * Returns minimal health status without exposing deployment internals
 */
export async function GET() {
    const hasEncryptionKey = !!process.env.COOKIE_ENCRYPTION_KEY;
    const encryptionKeyLength = (process.env.COOKIE_ENCRYPTION_KEY || '').length;
    const isEncryptionKeyValid = hasEncryptionKey && encryptionKeyLength >= 32;
    const status = isEncryptionKeyValid ? 'healthy' : 'degraded';

    const health = {
        status,
        timestamp: new Date().toISOString(),
        checks: {
            encryption: isEncryptionKeyValid ? 'ok' : 'error',
        },
    };

    return NextResponse.json(health, {
        status: status === 'healthy' ? 200 : 503,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
}
