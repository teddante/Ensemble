'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error boundary component to catch React render errors
 * and display a fallback UI instead of crashing the entire app
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="error-boundary-fallback">
                    <div className="error-boundary-content">
                        <h3>Something went wrong</h3>
                        <p>This component encountered an error and couldn&apos;t render properly.</p>
                        <button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            className="button-secondary"
                        >
                            Try again
                        </button>
                    </div>

                    <style jsx>{`
                        .error-boundary-fallback {
                            padding: 1.5rem;
                            background: var(--bg-secondary);
                            border: 1px solid var(--border-primary);
                            border-radius: 0.75rem;
                            text-align: center;
                        }
                        .error-boundary-content h3 {
                            color: var(--accent-warning);
                            margin-bottom: 0.5rem;
                            font-size: 1rem;
                        }
                        .error-boundary-content p {
                            color: var(--text-secondary);
                            font-size: 0.875rem;
                            margin-bottom: 1rem;
                        }
                    `}</style>
                </div>
            );
        }

        return this.props.children;
    }
}
