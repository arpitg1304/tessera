// Sampling strategy panel

import { useState, useMemo } from 'react';
import { Shuffle, Target, BarChart3, Loader2, Grid3x3, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useSampling } from '../hooks/useSampling';
import { applyFilters } from '../utils/filtering';
import type { VisualizationData } from '../types';

interface SamplingPanelProps {
  projectId: string;
  data: VisualizationData;
  hasEmbeddings?: boolean;  // If false, disable embedding-dependent strategies
}

type Strategy = 'kmeans' | 'stratified' | 'random' | 'cluster';

const STRATEGY_INFO = {
  kmeans: {
    name: 'Diversity (K-means)',
    description: 'Selects episodes that maximize coverage of the embedding space',
    icon: Target,
  },
  stratified: {
    name: 'Stratified',
    description: 'Maintains distribution across metadata categories',
    icon: BarChart3,
  },
  cluster: {
    name: 'Sample from Clusters',
    description: 'Evenly samples from each cluster (requires clustering first)',
    icon: Grid3x3,
  },
  random: {
    name: 'Random',
    description: 'Random baseline sampling',
    icon: Shuffle,
  },
};

export function SamplingPanel({ projectId, data, hasEmbeddings = true }: SamplingPanelProps) {
  // Default to random sampling if no embeddings (can't use kmeans/cluster)
  const [strategy, setStrategy] = useState<Strategy>(hasEmbeddings ? 'kmeans' : 'random');
  const [nSamples, setNSamples] = useState(Math.min(100, data.n_episodes));
  const [stratifyBy, setStratifyBy] = useState<string>(
    Object.keys(data.metadata)[0] || ''
  );
  const [selectionName, setSelectionName] = useState('');
  const [resultsExpanded, setResultsExpanded] = useState(false);

  const { lastSamplingResult, clusterLabels, clusterMetadata, metadataFilters, setLastSamplingResult, selectIndices } = useProjectStore();
  const samplingMutation = useSampling(projectId);

  // Compute filtered indices based on active metadata filters
  const filteredIndices = useMemo(() => {
    if (metadataFilters.length === 0) {
      return null; // No filtering, sample from all
    }
    const passedIndices = applyFilters(data.metadata, metadataFilters, data.n_episodes);
    return passedIndices.size > 0 ? Array.from(passedIndices) : null;
  }, [data.metadata, data.n_episodes, metadataFilters]);

  // Available episodes count (filtered or total)
  const availableCount = filteredIndices ? filteredIndices.length : data.n_episodes;
  const hasActiveFilters = metadataFilters.length > 0;

  // Client-side cluster sampling
  const handleClusterSampling = () => {
    if (!clusterLabels) return;

    // Group indices by cluster
    const clusterGroups: Record<number, number[]> = {};
    clusterLabels.forEach((label, idx) => {
      if (label === -1) return; // Skip noise points
      if (!clusterGroups[label]) {
        clusterGroups[label] = [];
      }
      clusterGroups[label].push(idx);
    });

    const clusterIds = Object.keys(clusterGroups).map(Number);
    const samplesPerCluster = Math.floor(nSamples / clusterIds.length);
    const remainder = nSamples % clusterIds.length;

    const selectedIndices: number[] = [];

    // Sample evenly from each cluster
    clusterIds.forEach((clusterId, clusterIdx) => {
      const clusterIndices = clusterGroups[clusterId];
      const samplesToTake = samplesPerCluster + (clusterIdx < remainder ? 1 : 0);
      const actualSamples = Math.min(samplesToTake, clusterIndices.length);

      // Random sample from this cluster
      const shuffled = [...clusterIndices].sort(() => Math.random() - 0.5);
      selectedIndices.push(...shuffled.slice(0, actualSamples));
    });

    // Calculate coverage score (use number of clusters covered)
    const coverageScore = clusterIds.length / (clusterMetadata?.n_clusters || clusterIds.length);

    // Get episode IDs for selected indices
    const selectedEpisodeIds = selectedIndices.map(idx => data.episode_ids[idx]);

    // Update store with selection
    setLastSamplingResult({
      selected_indices: selectedIndices,
      selected_episode_ids: selectedEpisodeIds,
      n_samples: selectedIndices.length,
      strategy: 'cluster',
      coverage_score: coverageScore,
    });
    selectIndices(selectedIndices);
  };

  const handleSample = () => {
    // Handle cluster sampling on the client side
    if (strategy === 'cluster') {
      handleClusterSampling();
      return;
    }

    // Server-side sampling for other strategies
    // Pass filtered indices if active filters exist
    samplingMutation.mutate({
      strategy,
      n_samples: nSamples,
      stratify_by: strategy === 'stratified' ? stratifyBy : undefined,
      selection_name: selectionName || undefined,
      filter_indices: filteredIndices || undefined,
    });
  };

  const StrategyIcon = STRATEGY_INFO[strategy].icon;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Target className="w-5 h-5" />
        Sampling
      </h3>

      {/* Strategy selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Strategy</label>
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as Strategy)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          {(Object.keys(STRATEGY_INFO) as Strategy[]).map((s) => {
            const info = STRATEGY_INFO[s];
            // Disable embedding-dependent strategies when no embeddings
            const isDisabled =
              (s === 'stratified' && Object.keys(data.metadata).length === 0) ||
              (s === 'cluster' && !clusterLabels) ||
              (s === 'kmeans' && !hasEmbeddings) ||
              (s === 'cluster' && !hasEmbeddings);

            return (
              <option key={s} value={s} disabled={isDisabled}>
                {info.name}
                {isDisabled && (s === 'kmeans' || s === 'cluster') && !hasEmbeddings
                  ? ' (requires embeddings)'
                  : isDisabled ? ' (not available)' : ''}
              </option>
            );
          })}
        </select>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {STRATEGY_INFO[strategy].description}
        </p>
      </div>

      {/* Stratify by (for stratified sampling) */}
      {strategy === 'stratified' && Object.keys(data.metadata).length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            Stratify by
          </label>
          <select
            value={stratifyBy}
            onChange={(e) => setStratifyBy(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            {Object.keys(data.metadata).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Filter indicator */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm text-blue-700 dark:text-blue-300">
            Sampling from {availableCount.toLocaleString()} filtered episodes
          </span>
        </div>
      )}

      {/* Number of samples */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Number of Samples: {nSamples.toLocaleString()}
        </label>
        <input
          type="range"
          min={1}
          max={availableCount}
          step={availableCount > 100 ? Math.max(1, Math.floor(availableCount / 100)) : 1}
          value={Math.min(nSamples, availableCount)}
          onChange={(e) => setNSamples(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
        />
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>1</span>
          <span>{availableCount.toLocaleString()}{hasActiveFilters ? ' (filtered)' : ''}</span>
        </div>
      </div>

      {/* Selection name (optional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Save as (optional)
        </label>
        <input
          type="text"
          value={selectionName}
          onChange={(e) => setSelectionName(e.target.value)}
          placeholder="e.g., diverse_10k"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Sample button */}
      <button
        onClick={handleSample}
        disabled={samplingMutation.isPending}
        className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {samplingMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Sampling...
          </>
        ) : (
          <>
            <StrategyIcon className="w-5 h-5" />
            Generate Sample
          </>
        )}
      </button>

      {/* Results */}
      {lastSamplingResult && (
        <div className="border-t pt-3">
          <button
            onClick={() => setResultsExpanded(!resultsExpanded)}
            className="flex items-center justify-between w-full mb-2 hover:opacity-70 transition-opacity"
          >
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200">Last Result</h4>
            {resultsExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>
          {resultsExpanded && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1 text-sm">
              <p>
                <span className="text-gray-600 dark:text-gray-300">Strategy:</span>{' '}
                <span className="font-medium text-gray-900 dark:text-white">{lastSamplingResult.strategy}</span>
              </p>
              <p>
                <span className="text-gray-600 dark:text-gray-300">Samples:</span>{' '}
                <span className="font-medium text-gray-900 dark:text-white">{lastSamplingResult.n_samples.toLocaleString()}</span>
              </p>
              <p>
                <span className="text-gray-600 dark:text-gray-300">Coverage:</span>{' '}
                <span className="font-medium text-primary-600">
                  {(lastSamplingResult.coverage_score * 100).toFixed(1)}%
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
