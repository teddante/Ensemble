import { NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * Health check endpoint for load balancers and monitoring
 * Returns basic health status of the service including dependency checks
 */
export async function GET() {
    // Check critical dependencies
    const hasEncryptionKey = !!process.env.COOKIE_ENCRYPTION_KEY;
    const encryptionKeyLength = (process.env.COOKIE_ENCRYPTION_KEY || '').length;
    const isEncryptionKeyValid = hasEncryptionKey && encryptionKeyLength >= 32;

    // Determine overall status
    const issues: string[] = [];
    if (!hasEncryptionKey) {
        issues.push('COOKIE_ENCRYPTION_KEY not set');
    } else if (!isEncryptionKeyValid) {
        issues.push('COOKIE_ENCRYPTION_KEY too short (min 32 chars)');
    }

    const status = issues.length === 0 ? 'healthy' : 'degraded';

    const health = {
        status,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        environment: process.env.NODE_ENV || 'development',
        checks: {
            encryption: isEncryptionKeyValid ? 'ok' : 'error',
        },
        ...(issues.length > 0 && { issues }),
    };

    return NextResponse.json(health, {
        status: status === 'healthy' ? 200 : 503,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
}
