'use client';

import { Settings, Clock, PlusCircle } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { ICON_SIZE } from '@/lib/constants';

interface HeaderProps {
    onOpenSettings: () => void;
    onOpenHistory: () => void;
    onNewChat: () => void;
}

export function Header({ onOpenSettings, onOpenHistory, onNewChat }: HeaderProps) {
    const { hasApiKey } = useSettings();

    return (
        <header className="header">
            <div className="header-content">
                <div className="logo-section">
                    <div className="logo-icon">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                            <circle cx="12" cy="4" r="2" fill="currentColor" />
                            <circle cx="12" cy="20" r="2" fill="currentColor" />
                            <circle cx="4" cy="12" r="2" fill="currentColor" />
                            <circle cx="20" cy="12" r="2" fill="currentColor" />
                            <circle cx="6" cy="6" r="1.5" fill="currentColor" />
                            <circle cx="18" cy="6" r="1.5" fill="currentColor" />
                            <circle cx="6" cy="18" r="1.5" fill="currentColor" />
                            <circle cx="18" cy="18" r="1.5" fill="currentColor" />
                            <line x1="12" y1="6" x2="12" y2="9" stroke="currentColor" strokeWidth="1.5" />
                            <line x1="12" y1="15" x2="12" y2="18" stroke="currentColor" strokeWidth="1.5" />
                            <line x1="6" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5" />
                            <line x1="15" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                    </div>
                    <div className="logo-text">
                        <h1>Ensemble</h1>
                        <p>Multi-LLM Intelligence</p>
                    </div>
                </div>

                <div className="header-actions">
                    <button
                        className="settings-button"
                        onClick={onNewChat}
                        aria-label="New Chat"
                        style={{ borderColor: 'var(--color-accent-primary)', color: 'var(--color-accent-secondary)', background: 'rgba(139, 92, 246, 0.1)' }}
                    >
                        <PlusCircle size={ICON_SIZE.lg} />
                        <span>New Chat</span>
                    </button>
                    {!hasApiKey && (
                        <span className="api-key-warning">
                            API key required
                        </span>
                    )}
                    <button
                        className="settings-button"
                        onClick={onOpenHistory}
                        aria-label="Open history"
                    >
                        <Clock size={ICON_SIZE.lg} />
                        <span>History</span>
                    </button>
                    <button
                        className="settings-button"
                        onClick={onOpenSettings}
                        aria-label="Open settings"
                    >
                        <Settings size={ICON_SIZE.lg} />
                        <span>Settings</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
