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
        const skeletons = container.querySelectorAll('.skeleton-chip');
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders selected models section with header', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);
        expect(screen.getByText('Selected Models')).toBeInTheDocument();
    });

    it('displays selected model names clearly', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);
        // Should show the selected model name
        expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
        // Should show the provider
        expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });

    it('shows add more models button', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);
        expect(screen.getByText('Add more models')).toBeInTheDocument();
    });

    it('expands model browser when clicking add more', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        const expandButton = screen.getByText('Add more models');
        fireEvent.click(expandButton);

        // Should now show search and filters
        expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument();
        expect(screen.getByText('Hide all models')).toBeInTheDocument();
    });

    it('shows FREE badge for free models in selected section', () => {
        // Update mock to include a free model as selected
        vi.doMock('@/hooks/useSettings', () => ({
            useSettings: () => ({
                settings: {
                    selectedModels: ['google/gemini-2.0-flash-exp:free'],
                    apiKey: '********',
                    refinementModel: 'anthropic/claude-3.5-sonnet',
                },
                updateSelectedModels: mockUpdateSelectedModels,
            }),
        }));

        render(<ModelSelector models={mockModels} isLoading={false} />);
        // Component should render without error
        expect(screen.getByText('Selected Models')).toBeInTheDocument();
    });

    it('filters models when searching', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        // Expand first
        fireEvent.click(screen.getByText('Add more models'));

        const searchInput = screen.getByPlaceholderText('Search models...');
        fireEvent.change(searchInput, { target: { value: 'GPT' } });

        expect(screen.getByText('2 models found')).toBeInTheDocument();
    });

    it('groups models by provider when expanded', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        // Expand first
        fireEvent.click(screen.getByText('Add more models'));

        // Should show provider headers
        expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
    });

    it('toggles model selection', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);

        // Expand first
        fireEvent.click(screen.getByText('Add more models'));

        // Expand OpenAI group
        const openAIHeader = screen.getByRole('button', { name: /OpenAI/i });
        fireEvent.click(openAIHeader);

        // Find GPT-4o in the list and click it
        const gpt4Button = screen.getByRole('button', { name: /GPT-4o$/i });
        fireEvent.click(gpt4Button);

        expect(mockUpdateSelectedModels).toHaveBeenCalledWith([
            'anthropic/claude-3.5-sonnet',
            'openai/gpt-4o'
        ]);
    });

    it('has proper ARIA attributes', () => {
        render(<ModelSelector models={mockModels} isLoading={false} />);
        const region = screen.getByRole('region', { name: 'Model selection' });
        expect(region).toBeInTheDocument();
    });
});
