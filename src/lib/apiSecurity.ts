import { NextRequest, NextResponse } from 'next/server';

const CSRF_HEADER = 'x-requested-with';

export function validateCSRF(request: NextRequest): boolean {
    const header = request.headers.get(CSRF_HEADER);
    return header === 'XMLHttpRequest' || header === 'fetch';
}

export function invalidRequestResponse(): NextResponse {
    return NextResponse.json(
        { error: 'Invalid request' },
        { status: 403 }
    );
}
