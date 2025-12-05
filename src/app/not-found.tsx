'use client';

import Link from 'next/link';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="error-page">
            <div className="error-container">
                <div className="error-icon">
                    <Search size={48} />
                </div>
                <h1>Page Not Found</h1>
                <p className="error-message">
                    The page you&apos;re looking for doesn&apos;t exist or has been moved.
                </p>
                <div className="error-actions">
                    <Link href="/" className="button-primary">
                        <Home size={18} />
                        <span>Go Home</span>
                    </Link>
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
          color: var(--text-secondary);
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
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }
        .error-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }
        .error-actions :global(a) {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          text-decoration: none;
        }
      `}</style>
        </div>
    );
}
