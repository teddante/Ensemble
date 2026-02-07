import { ModelResponse } from '@/types';

/**
 * Returns a stable key for a model response instance.
 * Falls back to modelId+index for older history entries without responseId.
 */
export function getResponseKey(response: ModelResponse, index: number): string {
    return response.responseId ?? `${response.modelId}-${index}`;
}
