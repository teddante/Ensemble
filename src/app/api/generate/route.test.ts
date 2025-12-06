import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the route
vi.mock('@/lib/rateLimit', () => ({
    generateRateLimiter: {
        check: vi.fn(),
    },
    getClientIdentifier: vi.fn(() => 'test-client'),
}));

vi.mock('@/lib/sessionLock', () => ({
    generationLock: {
        acquire: vi.fn(),
        release: vi.fn(),
    },
    getSessionIdentifier: vi.fn(() => 'test-session'),
}));

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
import { generateRateLimiter, getClientIdentifier } from '@/lib/rateLimit';
import { generationLock, getSessionIdentifier } from '@/lib/sessionLock';
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

    describe('Rate Limiting', () => {
        it('should return 429 when rate limit exceeded', async () => {
            vi.mocked(generateRateLimiter.check).mockResolvedValue({
                success: false,
                remaining: 0,
                retryAfter: 30,
            });

            const request = createRequest({
                prompt: 'Test prompt',
                models: ['openai/gpt-4'],
            });

            const response = await POST(request);

            expect(response.status).toBe(429);
            expect(response.headers.get('Retry-After')).toBe('30');

            const body = await response.json();
            expect(body.error).toContain('Too many requests');
        });

        it('should include default Retry-After when not provided', async () => {
            vi.mocked(generateRateLimiter.check).mockResolvedValue({
                success: false,
                remaining: 0,
            });

            const request = createRequest({
                prompt: 'Test prompt',
                models: ['openai/gpt-4'],
            });

            const response = await POST(request);

            expect(response.status).toBe(429);
            expect(response.headers.get('Retry-After')).toBe('60');
        });
    });

    describe('Session Lock', () => {
        it('should return 409 when session is already locked', async () => {
            vi.mocked(generateRateLimiter.check).mockResolvedValue({
                success: true,
                remaining: 5,
            });
            vi.mocked(generationLock.acquire).mockReturnValue(false);

            const request = createRequest({
                prompt: 'Test prompt',
                models: ['openai/gpt-4'],
            });

            const response = await POST(request);

            expect(response.status).toBe(409);

            const body = await response.json();
            expect(body.error).toContain('already in progress');
        });
    });

    describe('API Key Validation', () => {
        it('should return 401 when API key is missing', async () => {
            vi.mocked(generateRateLimiter.check).mockResolvedValue({
                success: true,
                remaining: 5,
            });
            vi.mocked(generationLock.acquire).mockReturnValue(true);
            vi.mocked(getApiKeyFromCookie).mockResolvedValue(null);

            const request = createRequest({
                prompt: 'Test prompt',
                models: ['openai/gpt-4'],
            });

            const response = await POST(request);

            expect(response.status).toBe(401);
            expect(generationLock.release).toHaveBeenCalledWith('test-session');

            const body = await response.json();
            expect(body.error).toContain('API key not configured');
        });
    });

    describe('Request Validation', () => {
        beforeEach(() => {
            vi.mocked(generateRateLimiter.check).mockResolvedValue({
                success: true,
                remaining: 5,
            });
            vi.mocked(generationLock.acquire).mockReturnValue(true);
            vi.mocked(getApiKeyFromCookie).mockResolvedValue('sk-or-v1-valid-key');
        });

        it('should return 400 for invalid prompt', async () => {
            const request = createRequest({
                prompt: '',
                models: ['openai/gpt-4'],
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            expect(generationLock.release).toHaveBeenCalledWith('test-session');
        });

        it('should return 400 for invalid models', async () => {
            const request = createRequest({
                prompt: 'Valid prompt',
                models: [],
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            expect(generationLock.release).toHaveBeenCalledWith('test-session');
        });

        it('should return 400 for invalid model format', async () => {
            const request = createRequest({
                prompt: 'Valid prompt',
                models: ['invalid model format'],
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            expect(generationLock.release).toHaveBeenCalledWith('test-session');
        });
    });

    describe('Request Body Size', () => {
        it('should return 413 when request body is too large', async () => {
            vi.mocked(generateRateLimiter.check).mockResolvedValue({
                success: true,
                remaining: 5,
            });
            vi.mocked(generationLock.acquire).mockReturnValue(true);

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
            expect(generationLock.release).toHaveBeenCalledWith('test-session');

            const body = await response.json();
            expect(body.error).toContain('too large');
        });
    });

    describe('Session Lock Cleanup', () => {
        it('should release lock after rate limit rejection', async () => {
            vi.mocked(generateRateLimiter.check).mockResolvedValue({
                success: false,
                remaining: 0,
                retryAfter: 30,
            });

            const request = createRequest({
                prompt: 'Test prompt',
                models: ['openai/gpt-4'],
            });

            await POST(request);

            // Lock should NOT have been acquired (rate limit hit before lock)
            expect(generationLock.acquire).not.toHaveBeenCalled();
        });

        it('should call release on validation failures', async () => {
            vi.mocked(generateRateLimiter.check).mockResolvedValue({
                success: true,
                remaining: 5,
            });
            vi.mocked(generationLock.acquire).mockReturnValue(true);
            vi.mocked(getApiKeyFromCookie).mockResolvedValue(null);

            const request = createRequest({
                prompt: 'Test prompt',
                models: ['openai/gpt-4'],
            });

            await POST(request);

            expect(generationLock.release).toHaveBeenCalledWith('test-session');
        });
    });
});
