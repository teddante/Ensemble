'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
    useEffect(() => {
        console.error('Application error:', error);
    }, [error]);

    return (
        <div className="error-page">
            <div className="error-container">
                <div className="error-icon">
                    <AlertTriangle size={48} />
                </div>
                <h1>Something went wrong</h1>
                <p className="error-message">
                    {error.message || 'An unexpected error occurred'}
                </p>
                {error.digest && (
                    <p className="error-digest">Error ID: {error.digest}</p>
                )}
                <div className="error-actions">
                    <button onClick={reset} className="button-primary">
                        <RefreshCw size={18} />
                        <span>Try again</span>
                    </button>
                    <button onClick={() => window.location.href = '/'} className="button-secondary">
                        Go to Home
                    </button>
                </div>
            </div>
        </div>
    );
}
