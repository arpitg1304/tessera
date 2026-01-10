// Control panel for visualization settings

import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import type { ColorScheme, VisualizationData } from '../types';
import type { MetadataFilter } from '../utils/filtering';
import { getOperatorsForType, inferFieldType } from '../utils/filtering';
import { useClustering } from '../hooks/useClustering';
import { Eye, EyeOff, Palette, Filter, X, Plus, Grid3x3, ChevronDown, ChevronRight } from 'lucide-react';

interface ControlPanelProps {
  data: VisualizationData;
  projectId?: string;
  hasEmbeddings?: boolean;  // If false, hide embedding-dependent features
}

export function ControlPanel({ data, projectId, hasEmbeddings = true }: ControlPanelProps) {
  const {
    colorBy,
    setColorBy,
    showSelectedOnly,
    setShowSelectedOnly,
    selectedIndices,
    selectAll,
    clearSelection,
    metadataFilters,
    addMetadataFilter,
    removeMetadataFilter,
    clearMetadataFilters,
    clusterLabels,
    clusterMetadata,
  } = useProjectStore();

  const { mutate: runClustering, isPending: isClusteringPending } = projectId
    ? useClustering(projectId)
    : { mutate: null, isPending: false };

  // Filter form state
  const [selectedField, setSelectedField] = useState<string>('');
  const [selectedOperator, setSelectedOperator] = useState<MetadataFilter['operator']>('equals');
  const [filterValue, setFilterValue] = useState<string>('');

  // Collapsible sections state
  const [clusteringExpanded, setClusteringExpanded] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [selectionExpanded, setSelectionExpanded] = useState(true);

  // Handle clustering
  const handleCluster = (method: 'kmeans' | 'dbscan') => {
    if (!runClustering) return;
    runClustering({
      method,
      // Auto-select n_clusters for kmeans, auto-tune eps for dbscan
    });
    // Automatically switch to cluster coloring
    setColorBy('cluster');
  };

  // Determine available color schemes based on metadata
  const colorOptions: { value: ColorScheme; label: string; available: boolean }[] = [
    { value: 'none', label: 'Default', available: true },
    { value: 'dataset', label: 'Dataset', available: 'dataset' in data.metadata },
    { value: 'success', label: 'Success/Failure', available: 'success' in data.metadata },
    { value: 'task', label: 'Task', available: 'task' in data.metadata },
    {
      value: 'episode_length',
      label: 'Episode Length',
      available: 'episode_length' in data.metadata,
    },
    // Cluster coloring only available with embeddings
    { value: 'cluster', label: 'Cluster', available: hasEmbeddings && clusterLabels !== null },
  ];

  // Get field type and available operators
  const metadataFields = Object.keys(data.metadata);
  const fieldType = selectedField
    ? inferFieldType(data.metadata[selectedField])
    : 'string';
  const availableOperators = getOperatorsForType(fieldType);

  // Handle adding a filter
  const handleAddFilter = () => {
    if (!selectedField || !filterValue) return;

    let value: string | number | boolean | (string | number)[];

    // Parse value based on field type and operator
    if (fieldType === 'boolean') {
      value = filterValue === 'true';
    } else if (fieldType === 'numeric') {
      value = parseFloat(filterValue);
      if (isNaN(value)) return; // Invalid number
    } else if (selectedOperator === 'in') {
      // For 'in' operator, split by comma
      value = filterValue.split(',').map(v => v.trim());
    } else {
      value = filterValue;
    }

    addMetadataFilter({
      field: selectedField,
      operator: selectedOperator,
      value,
    });

    // Reset form
    setFilterValue('');
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Palette className="w-5 h-5" />
        {hasEmbeddings ? 'Visualization' : 'Controls'}
      </h3>

      {/* Color by selector - only for projects with visualization */}
      {hasEmbeddings && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Color by</label>
          <select
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as ColorScheme)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {colorOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={!option.available}>
                {option.label}
                {!option.available && ' (not available)'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Clustering controls - only available with embeddings */}
      {projectId && hasEmbeddings && (
        <div className="border-t pt-3">
          <button
            onClick={() => setClusteringExpanded(!clusteringExpanded)}
            className="flex items-center justify-between w-full mb-3 hover:opacity-70 transition-opacity"
          >
            <div className="flex items-center gap-2">
              <Grid3x3 className="w-4 h-4 text-gray-700 dark:text-gray-200" />
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200">Clustering</h4>
            </div>
            {clusteringExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>

          {clusteringExpanded && (
            <div className="space-y-3">

          {clusterMetadata && (
            <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-900 dark:text-blue-200">
              <div className="font-medium mb-1">{clusterMetadata.method === 'kmeans' ? 'K-Means' : 'DBSCAN'}</div>
              <div>{clusterMetadata.n_clusters} clusters found</div>
              {clusterMetadata.n_noise !== undefined && clusterMetadata.n_noise > 0 && (
                <div>{clusterMetadata.n_noise} noise points ({(clusterMetadata.noise_ratio! * 100).toFixed(1)}%)</div>
              )}
            </div>
          )}

              <div className="flex gap-2">
                <button
                  onClick={() => handleCluster('kmeans')}
                  disabled={isClusteringPending}
                  className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isClusteringPending ? 'Clustering...' : 'K-Means'}
                </button>
                <button
                  onClick={() => handleCluster('dbscan')}
                  disabled={isClusteringPending}
                  className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isClusteringPending ? 'Clustering...' : 'DBSCAN'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Show selected only toggle - only for projects with visualization */}
      {hasEmbeddings && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Show selected only</span>
          <button
            onClick={() => setShowSelectedOnly(!showSelectedOnly)}
            className={`
              p-2 rounded-lg transition-colors
              ${showSelectedOnly
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }
            `}
          >
            {showSelectedOnly ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </button>
        </div>
      )}

      {/* Metadata filters */}
      <div className="border-t pt-3">
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          className="flex items-center justify-between w-full mb-3 hover:opacity-70 transition-opacity"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-700 dark:text-gray-200" />
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Filters {metadataFilters.length > 0 && `(${metadataFilters.length})`}
            </h4>
          </div>
          <div className="flex items-center gap-2">
            {metadataFilters.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearMetadataFilters();
                }}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"
              >
                Clear
              </button>
            )}
            {filtersExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </div>
        </button>

        {filtersExpanded && (
          <div>

        {/* Active filters */}
        {metadataFilters.length > 0 && (
          <div className="space-y-2 mb-3">
            {metadataFilters.map((filter, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-1 rounded text-xs"
              >
                <span className="flex-1">
                  <strong>{filter.field}</strong> {filter.operator}{' '}
                  {Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
                </span>
                <button
                  onClick={() => removeMetadataFilter(idx)}
                  className="p-0.5 hover:bg-primary-100 dark:hover:bg-primary-800/50 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add filter form */}
        <div className="space-y-2">
          <select
            value={selectedField}
            onChange={(e) => {
              setSelectedField(e.target.value);
              setSelectedOperator('equals');
              setFilterValue('');
            }}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select field...</option>
            {metadataFields.map((field) => (
              <option key={field} value={field}>
                {field.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {selectedField && (
            <>
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value as MetadataFilter['operator'])}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              >
                {availableOperators.map((op) => (
                  <option key={op} value={op}>
                    {op.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>

              {fieldType === 'boolean' ? (
                <select
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select value...</option>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : (
                <input
                  type={fieldType === 'numeric' ? 'number' : 'text'}
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  placeholder={
                    selectedOperator === 'in'
                      ? 'value1, value2, ...'
                      : fieldType === 'numeric'
                      ? 'Enter number...'
                      : 'Enter value...'
                  }
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                />
              )}

              <button
                onClick={handleAddFilter}
                disabled={!filterValue}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add Filter
              </button>
            </>
          )}
        </div>
          </div>
        )}
      </div>

      {/* Selection controls */}
      <div className="border-t pt-3">
        <button
          onClick={() => setSelectionExpanded(!selectionExpanded)}
          className="flex items-center justify-between w-full mb-3 hover:opacity-70 transition-opacity"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-700 dark:text-gray-200" />
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Selection {selectedIndices.size > 0 && `(${selectedIndices.size.toLocaleString()})`}
            </h4>
          </div>
          {selectionExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
        </button>

        {selectionExpanded && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {selectedIndices.size > 0
                ? `${selectedIndices.size.toLocaleString()} episodes selected`
                : 'No episodes selected'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                disabled={selectedIndices.size === 0}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Metadata summary */}
      {Object.keys(data.metadata).length > 0 && (
        <div className="border-t pt-3">
          <button
            onClick={() => setMetadataExpanded(!metadataExpanded)}
            className="flex items-center justify-between w-full mb-2 hover:opacity-70 transition-opacity"
          >
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200">Metadata Fields</h4>
            {metadataExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>
          {metadataExpanded && (
            <div className="space-y-1">
            {Object.entries(data.metadata).map(([key, values]) => {
              const uniqueCount = new Set(values).size;
              return (
                <div key={key} className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium">{key}:</span>{' '}
                  {typeof values[0] === 'boolean'
                    ? `${values.filter(Boolean).length} true / ${values.filter((v) => !v).length} false`
                    : `${uniqueCount} unique values`}
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
