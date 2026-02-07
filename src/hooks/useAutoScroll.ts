'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useAutoScroll() {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);

    useEffect(() => {
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
            const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
            shouldAutoScrollRef.current = isAtBottom;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToBottom = useCallback(() => {
        if (shouldAutoScrollRef.current && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, []);

    const forceScrollToBottom = useCallback(() => {
        shouldAutoScrollRef.current = true;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    return { messagesEndRef, scrollToBottom, forceScrollToBottom };
}
