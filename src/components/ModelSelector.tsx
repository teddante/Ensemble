'use client';

import { useState, useMemo } from 'react';
import { Check, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { Model } from '@/types';

interface ModelSelectorProps {
    models: Model[];
    isLoading?: boolean;
}

export function ModelSelector({ models, isLoading }: ModelSelectorProps) {
    const { settings, updateSelectedModels } = useSettings();
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());

    const toggleModel = (modelId: string) => {
        const isSelected = settings.selectedModels.includes(modelId);

        if (isSelected) {
            // Don't allow deselecting if it's the only one
            if (settings.selectedModels.length > 1) {
                updateSelectedModels(settings.selectedModels.filter(id => id !== modelId));
            }
        } else {
            updateSelectedModels([...settings.selectedModels, modelId]);
        }
    };

    const toggleProvider = (provider: string) => {
        setCollapsedProviders(prev => {
            const next = new Set(prev);
            if (next.has(provider)) {
                next.delete(provider);
            } else {
                next.add(provider);
            }
            return next;
        });
    };

    // Filter and group models
    const { selectedModels, groupedModels, filteredCount } = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();

        // Filter models by search query
        const filtered = query
            ? models.filter(m =>
                m.name.toLowerCase().includes(query) ||
                m.provider.toLowerCase().includes(query) ||
                m.id.toLowerCase().includes(query)
            )
            : models;

        // Separate selected models for "pinned" section
        const selected = filtered.filter(m => settings.selectedModels.includes(m.id));

        // Group remaining by provider
        const groups: Record<string, Model[]> = {};
        for (const model of filtered) {
            if (!groups[model.provider]) {
                groups[model.provider] = [];
            }
            groups[model.provider].push(model);
        }

        // Sort providers alphabetically
        const sortedGroups = Object.entries(groups)
            .sort(([a], [b]) => a.localeCompare(b));

        return {
            selectedModels: selected,
            groupedModels: sortedGroups,
            filteredCount: filtered.length
        };
    }, [models, searchQuery, settings.selectedModels]);

    if (isLoading) {
        return (
            <div className="model-selector">
                <div className="model-selector-loading">
                    <div className="skeleton-text" style={{ width: '60%' }} />
                    <div className="skeleton-chips">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="skeleton-chip" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="model-selector">
            <div className="model-selector-header">
                <h3>Select Models</h3>
                <span className="model-count">
                    {settings.selectedModels.length} selected
                </span>
            </div>

            {/* Search input */}
            <div className="model-search">
                <Search size={16} className="search-icon" />
                <input
                    type="text"
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="model-search-input"
                />
                {searchQuery && (
                    <span className="search-count">{filteredCount} found</span>
                )}
            </div>

            <div className="model-groups">
                {/* Selected models section (always visible at top) */}
                {selectedModels.length > 0 && !searchQuery && (
                    <div className="model-group selected-group">
                        <div className="model-chips">
                            {selectedModels.map((model) => (
                                <button
                                    key={model.id}
                                    onClick={() => toggleModel(model.id)}
                                    className="model-chip selected"
                                    title={model.description}
                                >
                                    <Check size={14} />
                                    <span className="model-name">{model.name}</span>
                                    <span className="model-provider">{model.provider}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Grouped by provider */}
                {groupedModels.map(([provider, providerModels]) => {
                    const isCollapsed = collapsedProviders.has(provider);
                    const selectedInGroup = providerModels.filter(m =>
                        settings.selectedModels.includes(m.id)
                    ).length;

                    return (
                        <div key={provider} className="model-group">
                            <button
                                className="model-group-header"
                                onClick={() => toggleProvider(provider)}
                            >
                                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                <span className="provider-name">{provider}</span>
                                <span className="provider-count">
                                    {selectedInGroup > 0 && (
                                        <span className="selected-count">{selectedInGroup} selected · </span>
                                    )}
                                    {providerModels.length} models
                                </span>
                            </button>

                            {!isCollapsed && (
                                <div className="model-chips">
                                    {providerModels.map((model) => {
                                        const isSelected = settings.selectedModels.includes(model.id);
                                        return (
                                            <button
                                                key={model.id}
                                                onClick={() => toggleModel(model.id)}
                                                className={`model-chip ${isSelected ? 'selected' : ''}`}
                                                title={model.description}
                                            >
                                                {isSelected && <Check size={14} />}
                                                <span className="model-name">{model.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {filteredCount === 0 && (
                    <div className="no-models-found">
                        No models found matching &quot;{searchQuery}&quot;
                    </div>
                )}
            </div>
        </div>
    );
}

