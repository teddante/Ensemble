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
        </div>
    );
}
