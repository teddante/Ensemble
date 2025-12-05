// Shared constants for the Ensemble application
// Centralizes magic numbers for maintainability

// API Limits
export const MAX_PROMPT_LENGTH = 50000;
export const MIN_PROMPT_LENGTH = 1;
export const MAX_MODELS = 10;
export const MIN_API_KEY_LENGTH = 10;
export const MAX_REQUEST_BODY_SIZE = 100 * 1024; // 100KB

// Synthesis
export const MAX_SYNTHESIS_CHARS = 8000;
export const DEFAULT_SYNTHESIS_CONTEXT_RESERVE = 4000; // Reserve for synthesis prompt template

// Storage
export const MAX_HISTORY_ITEMS = 50;
export const MODELS_CACHE_TTL = 1000 * 60 * 60; // 1 hour
export const COOKIE_EXPIRY_DAYS = 30;

// Rate Limiting (for documentation - actual limits in rateLimit.ts)
export const GENERATE_RATE_LIMIT = 10; // requests per minute
export const KEY_RATE_LIMIT = 5; // requests per minute
export const MODELS_RATE_LIMIT = 20; // requests per minute

// Retry Logic
export const MAX_RETRIES = 3;
export const INITIAL_RETRY_DELAY_MS = 1000;

// Encryption
export const ENCRYPTION_MAGIC_PREFIX = 'ENS:';
