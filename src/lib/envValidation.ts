// Environment validation for startup checks
// This module validates required environment variables at startup

/**
 * Validates that all required environment variables are set.
 * Call this at app startup to fail fast if configuration is missing.
 * 
 * @throws Error if required environment variables are missing or invalid
 */
export function validateEnvironment(): void {
    const errors: string[] = [];

    // COOKIE_ENCRYPTION_KEY is required for secure API key storage
    const encryptionKey = process.env.COOKIE_ENCRYPTION_KEY;
    if (!encryptionKey) {
        errors.push(
            'COOKIE_ENCRYPTION_KEY is required.\n' +
            'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    } else if (encryptionKey.length < 32) {
        errors.push('COOKIE_ENCRYPTION_KEY must be at least 32 characters');
    }

    // Note: Upstash Redis is no longer required - rate limiting and session locks removed
    // OpenRouter handles rate limiting based on user's API key

    // Log warnings for optional but recommended variables
    if (!process.env.OPENROUTER_API_KEY) {
        console.warn('[Ensemble] OPENROUTER_API_KEY not set - models list will use optional auth');
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
        console.warn('[Ensemble] NEXT_PUBLIC_APP_URL not set - using default referer');
    }

    // Throw combined errors
    if (errors.length > 0) {
        throw new Error(
            '❌ Environment validation failed:\n\n' +
            errors.map((e, i) => `${i + 1}. ${e}`).join('\n\n') +
            '\n\nPlease check your .env file and restart the server.'
        );
    }
}

/**
 * Validates environment in development mode only (for build compatibility)
 * In production Edge runtime, env validation happens at request time
 */
export function validateEnvironmentSafe(): void {
    // Only run full validation in development
    // In production, the crypto module handles missing keys at runtime
    if (process.env.NODE_ENV === 'development') {
        try {
            validateEnvironment();
        } catch (error) {
            console.error(error instanceof Error ? error.message : error);
        }
    }
}
