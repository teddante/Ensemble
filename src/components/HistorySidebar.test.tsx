'use client';

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistorySidebar } from './HistorySidebar';
import { HistoryItem } from '@/hooks/useHistory';

const mockOnClose = vi.fn();
const mockOnLoad = vi.fn();
const mockOnDelete = vi.fn();
const mockOnClear = vi.fn();

const mockHistory: HistoryItem[] = [
    {
        id: '1',
        timestamp: Date.now() - 60000, // 1 minute ago
        prompt: 'What is the meaning of life?',
        models: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
        refinementModel: 'anthropic/claude-3.5-sonnet',
        responses: [
            { modelId: 'anthropic/claude-3.5-sonnet', content: 'The meaning of life is...', status: 'complete' },
            { modelId: 'openai/gpt-4o', content: '42', status: 'complete' },
        ],
        synthesizedContent: 'The synthesized answer is...',
    },
    {
        id: '2',
        timestamp: Date.now() - 3600000, // 1 hour ago
        prompt: 'Explain quantum computing',
        models: ['google/gemini-2.0-flash-exp:free'],
        refinementModel: 'google/gemini-2.0-flash-exp:free',
        responses: [
            { modelId: 'google/gemini-2.0-flash-exp:free', content: 'Quantum computing...', status: 'complete' },
        ],
        synthesizedContent: 'Quantum computing uses...',
    },
];

describe('HistorySidebar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not render when closed', () => {
        render(
            <HistorySidebar
                isOpen={false}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        expect(screen.queryByText('History')).not.toBeInTheDocument();
    });

    it('renders history header when open', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        expect(screen.getByText('History')).toBeInTheDocument();
    });

    it('shows empty state when no history', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={[]}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        expect(screen.getByText('No history yet')).toBeInTheDocument();
    });

    it('renders history items', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        expect(screen.getByText('What is the meaning of life?')).toBeInTheDocument();
        expect(screen.getByText('Explain quantum computing')).toBeInTheDocument();
    });

    it('shows model count for each history item', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        expect(screen.getByText('2 models')).toBeInTheDocument();
        expect(screen.getByText('1 models')).toBeInTheDocument();
    });

    it('calls onClose when close button clicked', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        const closeButton = screen.getByRole('button', { name: /close history/i });
        fireEvent.click(closeButton);

        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onLoad when history item is clicked', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        const historyItem = screen.getByText('What is the meaning of life?');
        fireEvent.click(historyItem);

        expect(mockOnLoad).toHaveBeenCalledWith(mockHistory[0]);
    });

    it('shows delete confirmation modal when delete button clicked', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        const deleteButtons = screen.getAllByRole('button', { name: /delete item/i });
        fireEvent.click(deleteButtons[0]);

        expect(screen.getByText('Delete Item')).toBeInTheDocument();
        expect(screen.getByText('Are you sure you want to delete this history item?')).toBeInTheDocument();
    });

    it('calls onDelete when delete is confirmed', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        const deleteButtons = screen.getAllByRole('button', { name: /delete item/i });
        fireEvent.click(deleteButtons[0]);

        const confirmButton = screen.getByRole('button', { name: /^Delete$/i });
        fireEvent.click(confirmButton);

        expect(mockOnDelete).toHaveBeenCalledWith('1');
    });

    it('shows clear all button when history exists', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        // The button text is "Clear All History"
        expect(screen.getByRole('button', { name: /Clear All History/i })).toBeInTheDocument();
    });

    it('shows clear confirmation modal when clear button clicked', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        // Click the clear button
        const clearButton = screen.getByRole('button', { name: /Clear All History/i });
        fireEvent.click(clearButton);

        // Modal should show confirmation message
        expect(screen.getByText(/This will permanently delete all/)).toBeInTheDocument();
    });

    it('calls onClear when clear is confirmed', () => {
        render(
            <HistorySidebar
                isOpen={true}
                onClose={mockOnClose}
                history={mockHistory}
                onLoad={mockOnLoad}
                onDelete={mockOnDelete}
                onClear={mockOnClear}
            />
        );

        // Click clear button
        const clearButton = screen.getByRole('button', { name: /Clear All History/i });
        fireEvent.click(clearButton);

        // Confirm in modal - look for "Clear All" button in modal
        const confirmButton = screen.getByRole('button', { name: /^Clear All$/i });
        fireEvent.click(confirmButton);

        expect(mockOnClear).toHaveBeenCalledTimes(1);
    });
});
