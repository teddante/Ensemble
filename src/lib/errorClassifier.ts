/**
 * Centralized error classification for consistent error handling
 * across the application (retryability, user-facing messages, etc.)
 */

export type ErrorCategory =
    | 'auth'
    | 'credits'
    | 'forbidden'
    | 'bad_request'
    | 'not_found'
    | 'provider_timeout'
    | 'timeout'
    | 'rate_limit'
    | 'server_error'
    | 'cancelled'
    | 'unknown';

const RETRYABLE_CATEGORIES: Set<ErrorCategory> = new Set([
    'rate_limit',
    'timeout',
    'provider_timeout',
    'server_error',
]);

/**
 * Classify an error into a category based on its message content
 */
export function classifyError(error: unknown): ErrorCategory {
    if (!(error instanceof Error)) return 'unknown';

    if (error.name === 'AbortError') return 'cancelled';

    const message = error.message.toLowerCase();

    if (message.includes('401') || message.includes('api key') || message.includes('unauthorized')) {
        return 'auth';
    }
    if (message.includes('402') || message.includes('credits') || message.includes('balance')) {
        return 'credits';
    }
    if (message.includes('403') || message.includes('forbidden') || message.includes('moderation')) {
        return 'forbidden';
    }
    if (message.includes('400') || message.includes('bad request') || message.includes('validation')) {
        return 'bad_request';
    }
    if (message.includes('404') || message.includes('not found') || message.includes('model does not exist')) {
        return 'not_found';
    }
    if (message.includes('524')) {
        return 'provider_timeout';
    }
    if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
        return 'rate_limit';
    }
    if (message.includes('408') || message.includes('timeout') || message.includes('timed out')) {
        return 'timeout';
    }
    if (message.includes('502') || message.includes('503') || message.includes('504') ||
        message.includes('service unavailable') || message.includes('bad gateway') ||
        message.includes('gateway timeout')) {
        return 'server_error';
    }

    return 'unknown';
}

/**
 * Check if an error is retryable based on its classification
 */
export function isRetryableError(error: unknown): boolean {
    return RETRYABLE_CATEGORIES.has(classifyError(error));
}
