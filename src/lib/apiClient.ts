const REQUESTED_WITH_HEADER = 'X-Requested-With';

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has(REQUESTED_WITH_HEADER)) {
        headers.set(REQUESTED_WITH_HEADER, 'fetch');
    }

    return fetch(input, {
        credentials: 'include',
        ...init,
        headers: Object.fromEntries(headers.entries()),
    });
}

export async function getErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
        const data = await response.json();
        if (data && typeof data.error === 'string') {
            return data.error;
        }
    } catch {
        // fall back to provided message
    }
    return fallback;
}
