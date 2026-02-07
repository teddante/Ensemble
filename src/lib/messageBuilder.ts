import { Message } from '@/types';
import { HistoryItem } from '@/hooks/useHistory';

/**
 * Build the chat messages array from system prompt, session history, and current prompt.
 * History items are expected in newest-first order (as stored) and will be reversed.
 */
export function buildChatMessages(
    systemPrompt: string | undefined,
    sessionHistory: HistoryItem[],
    currentPrompt: string
): Message[] {
    const messages: Message[] = [];

    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    // Add historical messages oldest-first (history is stored newest-first)
    for (let i = sessionHistory.length - 1; i >= 0; i--) {
        const item = sessionHistory[i];
        messages.push({ role: 'user', content: item.prompt });
        if (item.synthesizedContent) {
            messages.push({ role: 'assistant', content: item.synthesizedContent });
        }
    }

    messages.push({ role: 'user', content: currentPrompt });

    return messages;
}
