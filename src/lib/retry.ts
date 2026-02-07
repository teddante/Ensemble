import { INITIAL_RETRY_DELAY_MS } from '@/lib/constants';

/**
 * Wait with exponential backoff + jitter before retrying an operation.
 * Jitter prevents thundering herd when multiple concurrent requests retry.
 */
export async function exponentialBackoff(
    attempt: number,
    initialDelayMs: number = INITIAL_RETRY_DELAY_MS
): Promise<void> {
    const baseDelay = initialDelayMs * Math.pow(2, attempt);
    const jitter = baseDelay * (0.5 + Math.random() * 0.5);
    await new Promise(resolve => setTimeout(resolve, jitter));
}
