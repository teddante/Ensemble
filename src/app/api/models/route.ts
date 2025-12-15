import { NextRequest, NextResponse } from 'next/server';
import { OpenRouter } from '@openrouter/sdk';
import { handleOpenRouterError } from '@/lib/errors';

export const runtime = 'edge';

const CSRF_HEADER = 'x-requested-with';

// CSRF protection: require custom header
function validateCSRF(request: NextRequest): boolean {
    const header = request.headers.get(CSRF_HEADER);
    return header === 'XMLHttpRequest' || header === 'fetch';
}



export async function GET(request: NextRequest) {
    // CSRF protection
    if (!validateCSRF(request)) {
        return NextResponse.json(
            { error: 'Invalid request' },
            { status: 403 }
        );
    }

    try {
        // Use server key if available, otherwise try user's cookie key
        let apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            // Fallback to user's cookie key for model listing
            const { getApiKeyFromCookie } = await import('@/app/api/key/route');
            apiKey = await getApiKeyFromCookie() || '';
        }

        const client = new OpenRouter({
            apiKey,
            httpReferer: process.env.NEXT_PUBLIC_APP_URL || 'https://ensemble.app',
            xTitle: 'Ensemble Multi-LLM',
        });

        const response = await client.models.list();
        const data = response.data;

        // Transform to our internal Model interface
        // Note: OpenRouter SDK uses camelCase (e.g., supportedParameters, contextLength)
        // but raw API responses use snake_case. The SDK normalizes to camelCase.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const models = data.map((m: any) => ({
            id: m.id,
            name: m.name,
            provider: m.id.split('/')[0],
            description: m.description || '',
            // SDK uses camelCase: contextLength, supportedParameters, topProvider, perRequestLimits
            contextWindow: m.contextLength || m.context_length,
            // Extended fields - handle both SDK camelCase and raw API snake_case
            canonical_slug: m.canonicalSlug || m.canonical_slug,
            created: m.created,
            supported_parameters: m.supportedParameters || m.supported_parameters,
            pricing: m.pricing,
            architecture: m.architecture,
            top_provider: m.topProvider || m.top_provider,
            per_request_limits: m.perRequestLimits || m.per_request_limits
        }));

        return NextResponse.json({ models });
    } catch (error) {
        console.error('Failed to fetch models:', error);
        return NextResponse.json(
            { error: handleOpenRouterError(error) },
            { status: 500 }
        );
    }
}

