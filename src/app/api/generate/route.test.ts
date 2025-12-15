import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the route
vi.mock('@/app/api/key/route', () => ({
    getApiKeyFromCookie: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    generateRequestId: vi.fn(() => 'test-request-id'),
}));

vi.mock('@openrouter/sdk', () => ({
    OpenRouter: vi.fn(() => ({
        chat: {
            send: vi.fn(),
        },
    })),
}));

// Import after mocks are set up
import { POST } from '@/app/api/generate/route';
import { getApiKeyFromCookie } from '@/app/api/key/route';
import { NextRequest } from 'next/server';

describe('/api/generate Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    function createRequest(body: object, headers: Record<string, string> = {}): NextRequest {
        return new NextRequest('http://localhost/api/generate', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...headers,
            },
            body: JSON.stringify(body),
        });
    }

    describe('API Key Validation', () => {
        it('should return 401 when API key is missing', async () => {
            vi.mocked(getApiKeyFromCookie).mockResolvedValue(null);

            const request = createRequest({
                prompt: 'Test prompt',
                models: ['openai/gpt-4'],
            });

            const response = await POST(request);

            expect(response.status).toBe(401);

            const body = await response.json();
            expect(body.error).toContain('API key not configured');
        });
    });

    describe('Request Validation', () => {
        beforeEach(() => {
            vi.mocked(getApiKeyFromCookie).mockResolvedValue('sk-or-v1-valid-key');
        });

        it('should return 400 for invalid prompt', async () => {
            const request = createRequest({
                prompt: '',
                models: ['openai/gpt-4'],
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
        });

        it('should return 400 for invalid models', async () => {
            const request = createRequest({
                prompt: 'Valid prompt',
                models: [],
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
        });

        it('should return 400 for invalid model format', async () => {
            const request = createRequest({
                prompt: 'Valid prompt',
                models: ['invalid model format'],
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
        });

        // No max models limit test - artificial limit removed
        // Users can now select as many models as they want
    });

    describe('Request Body Size', () => {
        it('should return 413 when request body is too large', async () => {
            // Create request with content-length header exceeding limit
            const request = createRequest(
                {
                    prompt: 'Test prompt',
                    models: ['openai/gpt-4'],
                },
                { 'content-length': '10000000' } // 10MB, exceeds MAX_REQUEST_BODY_SIZE
            );

            const response = await POST(request);

            expect(response.status).toBe(413);

            const body = await response.json();
            expect(body.error).toContain('too large');
        });
    });

    // Rate limiting tests removed - artificial limit removed
    // OpenRouter handles rate limiting based on user's API key

    // Session lock tests removed - artificial limit removed
    // Users can now run concurrent generations
});
