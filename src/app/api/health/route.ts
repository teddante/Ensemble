import { NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * Health check endpoint for load balancers and monitoring
 * Returns basic health status of the service
 */
export async function GET() {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        environment: process.env.NODE_ENV || 'development',
    };

    return NextResponse.json(health, {
        status: 200,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
}
