'use client';

import { useState, useMemo, useCallback } from 'react';
import { Check, Search, ChevronDown, ChevronRight, X, Zap, Wrench, Eye, Brain, Braces } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { Model } from '@/types';
import { formatContextLength, formatPricing, getModelCapabilities, isFreeModel } from '@/lib/modelUtils';
import { ICON_SIZE } from '@/lib/constants';

interface ModelSelectorProps {
    models: Model[];
    isLoading?: boolean;
}

type FilterType = 'all' | 'free';

export function ModelSelector({ models, isLoading }: ModelSelectorProps) {
    const { settings, updateSelectedModels } = useSettings();
    const [searchQuery, setSearchQuery] = useState('');
    // Start with all providers collapsed - will be populated when models load
    const [collapsedProviders, setCollapsedProviders] = useState<Set<string> | 'all'>('all');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [isExpanded, setIsExpanded] = useState(false);

    const toggleModel = useCallback((modelId: string) => {
        const isSelected = settings.selectedModels.includes(modelId);

        if (isSelected) {
            if (settings.selectedModels.length > 1) {
                updateSelectedModels(settings.selectedModels.filter(id => id !== modelId));
            }
        } else {
            updateSelectedModels([...settings.selectedModels, modelId]);
        }
    }, [settings.selectedModels, updateSelectedModels]);

    const toggleProvider = (provider: string) => {
        setCollapsedProviders(prev => {
            // If 'all' collapsed, create a set with all providers EXCEPT this one (expand it)
            if (prev === 'all') {
                const allProviders = new Set(models.map(m => m.provider));
                allProviders.delete(provider); // Remove the one we're expanding
                return allProviders;
            }
            // Otherwise toggle normally
            const next = new Set(prev);
            if (next.has(provider)) {
                next.delete(provider);
            } else {
                next.add(provider);
            }
            return next;
        });
    };

    // Get selected model objects
    const selectedModelObjects = useMemo(() => {
        return settings.selectedModels
            .map(id => models.find(m => m.id === id))
            .filter((m): m is Model => m !== undefined);
    }, [models, settings.selectedModels]);

    // Filter and group models
    const { groupedModels, filteredCount } = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();

        let filtered = query
            ? models.filter(m =>
                m.name.toLowerCase().includes(query) ||
                m.provider.toLowerCase().includes(query) ||
                m.id.toLowerCase().includes(query)
            )
            : models;

        if (activeFilter === 'free') {
            filtered = filtered.filter(isFreeModel);
        }

        const groups: Record<string, Model[]> = {};
        for (const model of filtered) {
            if (!groups[model.provider]) {
                groups[model.provider] = [];
            }
            groups[model.provider].push(model);
        }

        const sortedGroups = Object.entries(groups)
            .sort(([a], [b]) => a.localeCompare(b));

        return {
            groupedModels: sortedGroups,
            filteredCount: filtered.length
        };
    }, [models, searchQuery, activeFilter]);

    // Get filter counts
    const freeCount = useMemo(() => models.filter(isFreeModel).length, [models]);

    if (isLoading) {
        return (
            <div className="model-selector">
                <div className="model-selector-loading">
                    <div className="skeleton-text" style={{ width: '60%' }} />
                    <div className="skeleton-chips">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="skeleton-chip" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="model-selector" role="region" aria-label="Model selection">
            {/* Selected Models - Always Visible */}
            <div className="selected-models-section">
                <div className="selected-models-header">
                    <h3>Selected Models</h3>
                    <button
                        className="expand-toggle"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? 'Hide all models' : 'Add more models'}
                    </button>
                </div>

                <div className="selected-models-list">
                    {selectedModelObjects.length === 0 ? (
                        <p className="no-selection-message">No models selected</p>
                    ) : (
                        selectedModelObjects.map((model) => (
                            <div key={model.id} className="selected-model-tag model-chip">
                                <span className="selected-model-name">{model.name}</span>
                                <span className="selected-model-provider">{model.provider}</span>
                                {isFreeModel(model) && <span className="free-badge">FREE</span>}
                                {settings.selectedModels.length > 1 && (
                                    <button
                                        className="remove-model-btn"
                                        onClick={() => toggleModel(model.id)}
                                        aria-label={`Remove ${model.name}`}
                                    >
                                        <X size={ICON_SIZE.sm} />
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Expandable Model Browser */}
            {isExpanded && (
                <div className="model-browser">
                    {/* Filters */}
                    <div className="model-browser-controls">
                        <div className="model-filter-bar" role="tablist" aria-label="Filter models">
                            <button
                                className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setActiveFilter('all')}
                                role="tab"
                                aria-selected={activeFilter === 'all'}
                            >
                                All ({models.length})
                            </button>
                            <button
                                className={`filter-btn filter-free ${activeFilter === 'free' ? 'active' : ''}`}
                                onClick={() => setActiveFilter('free')}
                                role="tab"
                                aria-selected={activeFilter === 'free'}
                            >
                                <Zap size={12} /> Free ({freeCount})
                            </button>
                        </div>

                        <div className="model-search">
                            <Search size={ICON_SIZE.sm} className="search-icon" />
                            <input
                                type="text"
                                placeholder="Search models..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="model-search-input"
                            />
                            {searchQuery && (
                                <button
                                    className="search-clear"
                                    onClick={() => setSearchQuery('')}
                                    aria-label="Clear search"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Search results count */}
                    {searchQuery && (
                        <div className="search-results-info">
                            {filteredCount} models found
                        </div>
                    )}

                    {/* Model Groups */}
                    <div className="model-groups">
                        {groupedModels.map(([provider, providerModels]) => {
                            const isCollapsed = collapsedProviders === 'all' || collapsedProviders.has(provider);
                            const selectedInGroup = providerModels.filter(m =>
                                settings.selectedModels.includes(m.id)
                            ).length;

                            return (
                                <div key={provider} className="model-group">
                                    <button
                                        className="model-group-header"
                                        onClick={() => toggleProvider(provider)}
                                        aria-expanded={!isCollapsed}
                                    >
                                        {isCollapsed ? <ChevronRight size={ICON_SIZE.sm} /> : <ChevronDown size={ICON_SIZE.sm} />}
                                        <span className="provider-name">{provider}</span>
                                        <span className="provider-stats">
                                            {selectedInGroup > 0 && (
                                                <span className="selected-count">{selectedInGroup} selected</span>
                                            )}
                                            <span className="model-count">{providerModels.length} models</span>
                                        </span>
                                    </button>

                                    {!isCollapsed && (
                                        <div className="provider-models">
                                            {providerModels.map((model) => {
                                                const isSelected = settings.selectedModels.includes(model.id);
                                                const isFree = isFreeModel(model);
                                                const capabilities = getModelCapabilities(model);
                                                const contextStr = formatContextLength(model.contextWindow);
                                                const pricingStr = formatPricing(model.pricing);
                                                return (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => toggleModel(model.id)}
                                                        className={`model-option ${isSelected ? 'selected' : ''}`}
                                                        title={model.description}
                                                        aria-pressed={isSelected}
                                                    >
                                                        <div className="model-option-check">
                                                            {isSelected && <Check size={12} />}
                                                        </div>
                                                        <div className="model-option-info">
                                                            <span className="model-option-name">{model.name}</span>
                                                            <span className="model-option-meta">
                                                                {contextStr && <span className="meta-context">{contextStr}</span>}
                                                                {contextStr && pricingStr && <span className="meta-separator">•</span>}
                                                                {pricingStr && <span className={`meta-pricing ${isFree ? 'free' : ''}`}>{pricingStr}</span>}
                                                            </span>
                                                        </div>
                                                        <div className="model-option-badges">
                                                            {capabilities.includes('vision') && (
                                                                <span className="capability-badge" title="Vision"><Eye size={10} /></span>
                                                            )}
                                                            {capabilities.includes('tools') && (
                                                                <span className="capability-badge" title="Function Calling"><Wrench size={10} /></span>
                                                            )}
                                                            {capabilities.includes('reasoning') && (
                                                                <span className="capability-badge reasoning" title="Reasoning"><Brain size={10} /></span>
                                                            )}
                                                            {capabilities.includes('json') && (
                                                                <span className="capability-badge" title="Structured Output"><Braces size={10} /></span>
                                                            )}
                                                            {isFree && <span className="free-indicator">FREE</span>}
                                                        </div>
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
            )}
        </div>
    );
}
