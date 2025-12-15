// Shared constants for the Ensemble application
// Only contains legitimate server protection limits - no artificial user restrictions

// API Limits (Server Protection Only)
export const MIN_PROMPT_LENGTH = 1;
export const MIN_API_KEY_LENGTH = 10;
export const API_KEY_MASK = 'sk-********************';
export const MAX_REQUEST_BODY_SIZE = 5 * 1024 * 1024; // 5MB - server protection

// Synthesis (Configurable defaults - users can override in settings)
export const MAX_SYNTHESIS_CHARS = 32000; // Default, but user-configurable

// Storage
export const MODELS_CACHE_TTL = 1000 * 60 * 60; // 1 hour
export const COOKIE_EXPIRY_DAYS = 30;

// Retry Logic (Legitimate - prevents infinite loops)
export const MAX_RETRIES = 3;
export const INITIAL_RETRY_DELAY_MS = 1000;
export const REQUEST_TIMEOUT_MS = 120000; // 120s timeout - prevents hung connections

// Encryption
export const ENCRYPTION_MAGIC_PREFIX = 'ENS:';
