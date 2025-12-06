'use client';

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelSelector } from './ModelSelector';
import { Model } from '@/types';

// Mock useSettings hook
const mockUpdateSelectedModels = vi.fn();
vi.mock('@/hooks/useSettings', () => ({
    useSettings: () => ({
        settings: {
            selectedModels: ['anthropic/claude-3.5-sonnet'],
            apiKey: '********',
            refinementModel: 'anthropic/claude-3.5-sonnet',
        },
        updateSelectedModels: mockUpdateSelectedModels,
    }),
}));

const mockModels: Model[] = [
    {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'Anthropic',
        description: 'Most intelligent Claude model',
    },
    {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        description: 'OpenAI flagship model',
    },
    {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'OpenAI',
        description: 'Smaller OpenAI model',
    },
    {
        id: 'google/gemini-2.0-flash-exp:free',
        name: 'Gemini 2.0 Flash',
        provider: 'Google',
        description: 'Free Google model',
    },
];

describe('ModelSelector', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders loading skeleton when isLoading is true', () => {
        const { container } = render(<ModelSelector models={[]} isLoading={true} />);

        // Should show skeleton elements
        const skeletons = container.querySelectorAll('.skeleton-chip');
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders model selector with header', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        expect(screen.getByText('Select Models')).toBeInTheDocument();
        expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('renders search input', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument();
    });

    it('filters models when searching', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        const searchInput = screen.getByPlaceholderText('Search models...');
        fireEvent.change(searchInput, { target: { value: 'GPT' } });

        // Should show filter count
        expect(screen.getByText('2 found')).toBeInTheDocument();
    });

    it('groups models by provider', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        // Should show provider group headers (may appear multiple times due to selected section)
        expect(screen.getAllByText('Anthropic').length).toBeGreaterThan(0);
        expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
    });

    it('shows model count per provider', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        // OpenAI has 2 models
        expect(screen.getByText(/2 models/)).toBeInTheDocument();
    });

    it('toggles model selection on click', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        // Find and click GPT-4o to select it
        const gpt4Button = screen.getByRole('button', { name: /Select GPT-4o$/i });
        fireEvent.click(gpt4Button);

        expect(mockUpdateSelectedModels).toHaveBeenCalledWith([
            'anthropic/claude-3.5-sonnet',
            'openai/gpt-4o'
        ]);
    });

    it('prevents deselecting last model', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        // Find and click Claude to try to deselect (it's the only selected model)
        const claudeButtons = screen.getAllByRole('button', { name: /Deselect Claude/i });
        fireEvent.click(claudeButtons[0]);

        // Should not call updateSelectedModels since it's the last one
        expect(mockUpdateSelectedModels).not.toHaveBeenCalled();
    });

    it('shows no results message when search yields nothing', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        const searchInput = screen.getByPlaceholderText('Search models...');
        fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

        expect(screen.getByText(/No models found matching/)).toBeInTheDocument();
    });

    it('has proper ARIA attributes', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        const region = screen.getByRole('region', { name: 'Model selection' });
        expect(region).toBeInTheDocument();
    });
});
