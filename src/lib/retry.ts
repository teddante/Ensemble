import { INITIAL_RETRY_DELAY_MS } from '@/lib/constants';

/**
 * Wait with exponential backoff before retrying an operation
 */
export async function exponentialBackoff(
    attempt: number,
    initialDelayMs: number = INITIAL_RETRY_DELAY_MS
): Promise<void> {
    const delay = initialDelayMs * Math.pow(2, attempt);
    await new Promise(resolve => setTimeout(resolve, delay));
}
