import { NextRequest, NextResponse } from 'next/server';
import { OpenRouter } from '@openrouter/sdk';
import { modelsRateLimiter, getClientIdentifier } from '@/lib/rateLimit';

export const runtime = 'edge';

const CSRF_HEADER = 'x-requested-with';

// CSRF protection: require custom header
function validateCSRF(request: NextRequest): boolean {
    const header = request.headers.get(CSRF_HEADER);
    return header === 'XMLHttpRequest' || header === 'fetch';
}

// Sanitize error messages for production
function sanitizeError(error: unknown): string {
    if (process.env.NODE_ENV === 'development') {
        return error instanceof Error ? error.message : 'Unknown error';
    }
    // In production, only return generic error
    return 'Failed to fetch models';
}

export async function GET(request: NextRequest) {
    // CSRF protection
    if (!validateCSRF(request)) {
        return NextResponse.json(
            { error: 'Invalid request' },
            { status: 403 }
        );
    }

    // Rate limiting
    const clientId = getClientIdentifier(request);
    const rateLimit = await modelsRateLimiter.check(clientId);

    if (!rateLimit.success) {
        return NextResponse.json(
            { error: 'Too many requests' },
            {
                status: 429,
                headers: { 'Retry-After': String(rateLimit.retryAfter || 60) }
            }
        );
    }

    try {
        const client = new OpenRouter({
            apiKey: process.env.OPENROUTER_API_KEY || '',
            httpReferer: process.env.NEXT_PUBLIC_APP_URL || 'https://ensemble.app',
            xTitle: 'Ensemble Multi-LLM',
        });

        const response = await client.models.list();
        const data = response.data;

        // Transform to our internal Model interface
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const models = data.map((m: any) => ({
            id: m.id,
            name: m.name,
            provider: m.id.split('/')[0],
            description: m.description || '',
            contextWindow: m.context_length,
            // Extended fields from OpenRouter docs
            canonical_slug: m.canonical_slug,
            created: m.created,
            supported_parameters: m.supported_parameters,
            pricing: m.pricing,
            architecture: m.architecture,
            top_provider: m.top_provider,
            per_request_limits: m.per_request_limits
        }));

        return NextResponse.json({ models });
    } catch (error) {
        console.error('Failed to fetch models:', error);
        return NextResponse.json(
            { error: sanitizeError(error) },
            { status: 500 }
        );
    }
}

