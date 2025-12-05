import { NextResponse } from 'next/server';
import { OpenRouter } from '@openrouter/sdk';

export const runtime = 'edge';

export async function GET() {
    try {
        const client = new OpenRouter({
            apiKey: process.env.OPENROUTER_API_KEY || '', // Optional for public models list, but good practice
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
            provider: m.id.split('/')[0], // Simple heuristic, works for most "provider/model" IDs
            description: m.description || '',
            contextWindow: m.context_length,
            pricing: m.pricing,
            architecture: m.architecture,
            top_provider: m.top_provider,
            per_request_limits: m.per_request_limits
        }));

        return NextResponse.json({ models });
    } catch (error) {
        console.error('Failed to fetch models:', error);
        return NextResponse.json(
            { error: 'Failed to fetch models', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
