import { NextResponse } from 'next/server';
import { handleOpenRouterError } from '@/lib/errors';
import { withCSRF, errorResponse } from '@/lib/apiSecurity';
import { createOpenRouterClient } from '@/lib/openrouter';
import { logger } from '@/lib/logger';

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

        // Transform SDK model type (camelCase) to our internal Model interface
        const models = response.data.map(m => ({
            id: m.id,
            name: m.name,
            provider: m.id.split('/')[0],
            description: m.description || '',
            contextWindow: m.contextLength,
            canonical_slug: m.canonicalSlug,
            created: m.created,
            supported_parameters: m.supportedParameters as string[],
            pricing: m.pricing,
            architecture: m.architecture,
            top_provider: m.topProvider,
            per_request_limits: m.perRequestLimits
        }));

        return NextResponse.json({ models });
    } catch (error) {
        logger.error('Failed to fetch models', { error: String(error) });
        return errorResponse(handleOpenRouterError(error), 500);
    }
});
