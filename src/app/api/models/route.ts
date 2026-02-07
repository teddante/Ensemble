import { NextResponse } from 'next/server';
import { handleOpenRouterError } from '@/lib/errors';
import { withCSRF, errorResponse } from '@/lib/apiSecurity';
import { createOpenRouterClient } from '@/lib/openrouter';

export const runtime = 'edge';

export const GET = withCSRF(async () => {
    try {
        // Use server key if available, otherwise try user's cookie key
        let apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            // Fallback to user's cookie key for model listing
            const { getApiKeyFromCookie } = await import('@/app/api/key/route');
            apiKey = await getApiKeyFromCookie() || '';
        }

        const client = createOpenRouterClient(apiKey);

        const response = await client.models.list();
        const data = response.data;

        // Transform to our internal Model interface
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const models = data.map((m: any) => ({
            id: m.id,
            name: m.name,
            provider: m.id.split('/')[0],
            description: m.description || '',
            contextWindow: m.contextLength || m.context_length,
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
        return errorResponse(handleOpenRouterError(error), 500);
    }
});
