import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';

import { SettingsProvider, useSettings } from './useSettings';
import React from 'react';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test component to access hook values
function TestConsumer({ onSettings }: { onSettings: (ctx: ReturnType<typeof useSettings>) => void }) {
    const settings = useSettings();
    React.useEffect(() => {
        onSettings(settings);
    }, [settings, onSettings]);
    return null;
}

describe('useSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear localStorage
        localStorage.clear();
        // Default mock for key check
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ hasKey: false }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('SettingsProvider', () => {
        it('should initialize with default values', async () => {
            let settingsValue: ReturnType<typeof useSettings> | null = null;

            render(
                <SettingsProvider>
                    <TestConsumer onSettings={(s) => { settingsValue = s; }} />
                </SettingsProvider>
            );

            await waitFor(() => {
                expect(settingsValue).not.toBeNull();
                expect(settingsValue!.hasApiKey).toBe(false);
            });
        });

        it('should check server for API key on mount', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ hasKey: true }),
            });

            let settingsValue: ReturnType<typeof useSettings> | null = null;

            render(
                <SettingsProvider>
                    <TestConsumer onSettings={(s) => { settingsValue = s; }} />
                </SettingsProvider>
            );

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalledWith('/api/key', expect.objectContaining({
                    credentials: 'include',
                    headers: { 'X-Requested-With': 'fetch' },
                }));
            });

            await waitFor(() => {
                expect(settingsValue!.hasApiKey).toBe(true);
            });
        });
    });

    describe('updateApiKey', () => {
        it('should POST key to server and update state on success', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ hasKey: false }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ success: true }),
                });

            let settingsValue: ReturnType<typeof useSettings> | null = null;

            render(
                <SettingsProvider>
                    <TestConsumer onSettings={(s) => { settingsValue = s; }} />
                </SettingsProvider>
            );

            await waitFor(() => {
                expect(settingsValue!.isCheckingKey).toBe(false);
            });

            await act(async () => {
                const result = await settingsValue!.updateApiKey('sk-test-key-123');
                expect(result.success).toBe(true);
            });

            expect(mockFetch).toHaveBeenCalledWith('/api/key', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ apiKey: 'sk-test-key-123' }),
            }));
        });

        it('should DELETE key when empty string provided', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ hasKey: true }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ success: true }),
                });

            let settingsValue: ReturnType<typeof useSettings> | null = null;

            render(
                <SettingsProvider>
                    <TestConsumer onSettings={(s) => { settingsValue = s; }} />
                </SettingsProvider>
            );

            await waitFor(() => {
                expect(settingsValue!.isCheckingKey).toBe(false);
            });

            await act(async () => {
                const result = await settingsValue!.updateApiKey('');
                expect(result.success).toBe(true);
            });

            expect(mockFetch).toHaveBeenCalledWith('/api/key', expect.objectContaining({
                method: 'DELETE',
            }));
        });

        it('should return error on failed API call', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ hasKey: false }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    json: () => Promise.resolve({ error: 'Invalid API key' }),
                });

            let settingsValue: ReturnType<typeof useSettings> | null = null;

            render(
                <SettingsProvider>
                    <TestConsumer onSettings={(s) => { settingsValue = s; }} />
                </SettingsProvider>
            );

            await waitFor(() => {
                expect(settingsValue!.isCheckingKey).toBe(false);
            });

            await act(async () => {
                const result = await settingsValue!.updateApiKey('sk-bad-key');
                expect(result.success).toBe(false);
                expect(result.error).toBe('Invalid API key');
            });
        });
    });

    describe('updateSelectedModels', () => {
        it('should update selected models in state', async () => {
            let settingsValue: ReturnType<typeof useSettings> | null = null;

            render(
                <SettingsProvider>
                    <TestConsumer onSettings={(s) => { settingsValue = s; }} />
                </SettingsProvider>
            );

            await waitFor(() => {
                expect(settingsValue!.isCheckingKey).toBe(false);
            });

            act(() => {
                settingsValue!.updateSelectedModels(['openai/gpt-4o', 'anthropic/claude-3.5-sonnet']);
            });

            await waitFor(() => {
                expect(settingsValue!.settings.selectedModels).toEqual(['openai/gpt-4o', 'anthropic/claude-3.5-sonnet']);
            });
        });
    });

    describe('updateRefinementModel', () => {
        it('should update refinement model in state', async () => {
            let settingsValue: ReturnType<typeof useSettings> | null = null;

            render(
                <SettingsProvider>
                    <TestConsumer onSettings={(s) => { settingsValue = s; }} />
                </SettingsProvider>
            );

            await waitFor(() => {
                expect(settingsValue!.isCheckingKey).toBe(false);
            });

            act(() => {
                settingsValue!.updateRefinementModel('openai/gpt-4o');
            });

            await waitFor(() => {
                expect(settingsValue!.settings.refinementModel).toBe('openai/gpt-4o');
            });
        });
    });

    describe('error handling', () => {
        it('should throw error when useSettings is used outside provider', () => {
            // Suppress console.error for this test
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            expect(() => {
                render(<TestConsumer onSettings={() => { }} />);
            }).toThrow('useSettings must be used within a SettingsProvider');

            consoleSpy.mockRestore();
        });
    });
});
