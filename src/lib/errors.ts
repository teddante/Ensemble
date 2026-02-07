import { classifyError, ErrorCategory } from '@/lib/errorClassifier';

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

const USER_FRIENDLY_MESSAGES: Record<ErrorCategory, string> = {
    auth: 'Invalid API key. Please check your settings.',
    credits: 'Insufficient OpenRouter credits. Please top up your account.',
    forbidden: 'Request blocked by moderation filter or access denied.',
    bad_request: '', // Handled specially to include original message
    not_found: 'The selected model is currently unavailable or does not exist.',
    provider_timeout: 'The AI provider timed out. The model might be overloaded.',
    timeout: 'The request timed out. Please try again.',
    rate_limit: 'Rate limit exceeded. Please wait a moment before trying again.',
    server_error: 'The AI provider is currently experiencing issues. Please try a different model.',
    cancelled: 'Request cancelled',
    unknown: 'An error occurred while processing your request. Please try again later.',
};

/**
 * Maps OpenRouter and generic API errors to user-friendly messages
 */
export function handleOpenRouterError(error: unknown): string {
    if (process.env.NODE_ENV === 'development') {
        return error instanceof Error ? error.message : String(error);
    }

    if (error instanceof AppError || (error instanceof Error && error.name === 'AppError')) {
        return error.message;
    }

    // Check for safe pass-through messages
    if (error instanceof Error || (typeof error === 'object' && error !== null && 'message' in error)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const originalMessage = (error as any).message;
        const safeMessages = ['Request cancelled', 'Model not available'];
        for (const safe of safeMessages) {
            if (originalMessage.includes(safe)) {
                return originalMessage;
            }
        }

        const category = classifyError(error);
        if (category === 'bad_request') {
            return `invalid request: ${originalMessage}`;
        }
        return USER_FRIENDLY_MESSAGES[category];
    }

    return USER_FRIENDLY_MESSAGES.unknown;
}
