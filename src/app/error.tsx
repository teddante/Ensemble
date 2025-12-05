'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
    useEffect(() => {
        // Log the error to an error reporting service
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

            <style jsx>{`
        .error-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: var(--bg-primary);
        }
        .error-container {
          text-align: center;
          max-width: 500px;
          padding: 3rem;
          background: var(--bg-secondary);
          border-radius: 1rem;
          border: 1px solid var(--border-primary);
        }
        .error-icon {
          color: var(--accent-warning);
          margin-bottom: 1.5rem;
        }
        h1 {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.75rem;
        }
        .error-message {
          color: var(--text-secondary);
          margin-bottom: 1rem;
          line-height: 1.5;
        }
        .error-digest {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-family: monospace;
          margin-bottom: 1.5rem;
        }
        .error-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }
        .error-actions button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
      `}</style>
        </div>
    );
}
