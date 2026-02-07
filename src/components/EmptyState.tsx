import { ReactNode } from 'react';

interface EmptyStateProps {
    icon: ReactNode;
    message: string;
    className?: string;
}

export function EmptyState({ icon, message, className = 'history-empty' }: EmptyStateProps) {
    return (
        <div className={className}>
            {icon}
            <p>{message}</p>
        </div>
    );
}
