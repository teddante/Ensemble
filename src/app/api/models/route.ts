import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://ensemble.app',
                'X-Title': 'Ensemble Multi-LLM',
            },
            next: { revalidate: 3600 } // Cache for 1 hour
        });

        if (!response.ok) {
            throw new Error(`OpenRouter API responded with ${response.status}`);
        }

        const data = await response.json();

        // Transform to our internal Model interface
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const models = data.data.map((m: any) => ({
            id: m.id,
            name: m.name,
            provider: m.id.split('/')[0], // Simple heuristic, works for most "provider/model" IDs
            description: m.description || '',
            contextWindow: m.context_length,
            pricing: m.pricing
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
