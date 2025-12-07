export class AppError extends Error {
    public status: number;
    public code?: string;

    constructor(message: string, status: number = 500, code?: string) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'AppError';
    }
}

/**
 * Maps OpenRouter and generic API errors to user-friendly messages
 */
export function handleOpenRouterError(error: unknown): string {
    if (process.env.NODE_ENV === 'development') {
        // In development, return the raw error for better debugging
        return error instanceof Error ? error.message : String(error);
    }

    if (error instanceof AppError || (error instanceof Error && error.name === 'AppError')) {
        return error.message;
    }

    if (error instanceof Error || (typeof error === 'object' && error !== null && 'message' in error)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const originalMessage = (error as any).message;
        const message = String(originalMessage).toLowerCase();

        // 401 - Invalid API Key
        if (message.includes('401') || message.includes('api key') || message.includes('unauthorized')) {
            return 'Invalid API key. Please check your settings.';
        }

        // 402 - Insufficient Credits
        if (message.includes('402') || message.includes('credits') || message.includes('balance')) {
            return 'Insufficient OpenRouter credits. Please top up your account.';
        }

        // 403 - Forbidden / Moderation
        if (message.includes('403') || message.includes('forbidden') || message.includes('moderation')) {
            return 'Request blocked by moderation filter or access denied.';
        }

        // 400 - Bad Request (often validation errors)
        if (message.includes('400') || message.includes('bad request') || message.includes('validation')) {
            return `invalid request: ${originalMessage}`;
        }

        // 404 - Model Not Found
        if (message.includes('404') || message.includes('not found') || message.includes('model does not exist')) {
            return 'The selected model is currently unavailable or does not exist.';
        }

        // 524 - Provider Timeout
        if (message.includes('524')) {
            return 'The AI provider timed out. The model might be overloaded.';
        }

        // 408 - Request Timeout
        if (message.includes('408') || message.includes('timeout') || message.includes('timed out')) {
            return 'The request timed out. Please try again.';
        }

        // 429 - Rate Limit
        if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
            return 'Rate limit exceeded. Please wait a moment before trying again.';
        }

        // 502/503 - Provider Error
        if (message.includes('502') || message.includes('503') || message.includes('service unavailable') || message.includes('bad gateway')) {
            return 'The AI provider is currently experiencing issues. Please try a different model.';
        }

        // Common safe messages that we should pass through if we catch them
        const safeMessages = [
            'Request cancelled',
            'Model not available',
        ];

        for (const safe of safeMessages) {
            if (originalMessage.includes(safe)) {
                return originalMessage;
            }
        }
    }

    // Default generic error for unhandled cases
    return 'An error occurred while processing your request. Please try again later.';
}
