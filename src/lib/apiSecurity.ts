import { NextRequest, NextResponse } from 'next/server';

const CSRF_HEADER = 'x-requested-with';

export function validateCSRF(request: NextRequest): boolean {
    const header = request.headers.get(CSRF_HEADER);
    return header === 'XMLHttpRequest' || header === 'fetch';
}

export function errorResponse(message: string, status: number, headers?: Record<string, string>): NextResponse {
    return NextResponse.json({ error: message }, { status, headers });
}

/**
 * Higher-order function that wraps a Next.js route handler with CSRF validation.
 */
export function withCSRF<T>(
    handler: (request: NextRequest) => Promise<T>
): (request: NextRequest) => Promise<T | NextResponse> {
    return async (request: NextRequest) => {
        if (!validateCSRF(request)) {
            return errorResponse('Invalid request', 403);
        }
        return handler(request);
    };
}
