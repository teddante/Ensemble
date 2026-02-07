import { NextRequest, NextResponse } from 'next/server';

const CSRF_HEADER = 'x-requested-with';

function validateCSRF(request: NextRequest): boolean {
    const header = request.headers.get(CSRF_HEADER);
    return header === 'XMLHttpRequest' || header === 'fetch';
}

function invalidRequestResponse(): NextResponse {
    return NextResponse.json(
        { error: 'Invalid request' },
        { status: 403 }
    );
}

/**
 * Higher-order function that wraps a Next.js route handler with CSRF validation.
 */
export function withCSRF<T>(
    handler: (request: NextRequest) => Promise<T>
): (request: NextRequest) => Promise<T | NextResponse> {
    return async (request: NextRequest) => {
        if (!validateCSRF(request)) {
            return invalidRequestResponse();
        }
        return handler(request);
    };
}
