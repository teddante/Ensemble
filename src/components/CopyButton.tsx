'use client';

import { Copy, Check } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { ICON_SIZE } from '@/lib/constants';

interface CopyButtonProps {
    content: string;
    className?: string;
    label?: string;
    iconSize?: number;
}

export function CopyButton({ content, className = 'copy-button', label, iconSize = ICON_SIZE.md }: CopyButtonProps) {
    const { copied, copy } = useCopyToClipboard();

    return (
        <button
            className={className}
            onClick={() => copy(content)}
            aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
        >
            {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
            {label !== undefined && <span>{copied ? 'Copied!' : label}</span>}
        </button>
    );
}
