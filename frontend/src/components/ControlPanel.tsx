// Control panel for visualization settings

import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import type { ColorScheme, VisualizationData } from '../types';
import type { MetadataFilter } from '../utils/filtering';
import { getOperatorsForType, inferFieldType } from '../utils/filtering';
import { Eye, EyeOff, Palette, Filter, X, Plus } from 'lucide-react';

interface ControlPanelProps {
  data: VisualizationData;
}

export function ControlPanel({ data }: ControlPanelProps) {
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
  } = useProjectStore();

  // Filter form state
  const [selectedField, setSelectedField] = useState<string>('');
  const [selectedOperator, setSelectedOperator] = useState<MetadataFilter['operator']>('equals');
  const [filterValue, setFilterValue] = useState<string>('');

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
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Palette className="w-5 h-5" />
        Visualization
      </h3>

      {/* Color by selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Color by</label>
        <select
          value={colorBy}
          onChange={(e) => setColorBy(e.target.value as ColorScheme)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          {colorOptions.map((option) => (
            <option key={option.value} value={option.value} disabled={!option.available}>
              {option.label}
              {!option.available && ' (not available)'}
            </option>
          ))}
        </select>
      </div>

      {/* Show selected only toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Show selected only</span>
        <button
          onClick={() => setShowSelectedOnly(!showSelectedOnly)}
          className={`
            p-2 rounded-lg transition-colors
            ${showSelectedOnly
              ? 'bg-primary-100 text-primary-600'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }
          `}
        >
          {showSelectedOnly ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
        </button>
      </div>

      {/* Metadata filters */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </h4>
          {metadataFilters.length > 0 && (
            <button
              onClick={clearMetadataFilters}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Active filters */}
        {metadataFilters.length > 0 && (
          <div className="space-y-2 mb-3">
            {metadataFilters.map((filter, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-primary-50 text-primary-700 px-2 py-1 rounded text-xs"
              >
                <span className="flex-1">
                  <strong>{filter.field}</strong> {filter.operator}{' '}
                  {Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
                </span>
                <button
                  onClick={() => removeMetadataFilter(idx)}
                  className="p-0.5 hover:bg-primary-100 rounded"
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
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
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
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
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
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
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
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
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

      {/* Selection controls */}
      <div className="border-t pt-4">
        <p className="text-sm text-gray-600 mb-3">
          {selectedIndices.size > 0
            ? `${selectedIndices.size.toLocaleString()} episodes selected`
            : 'No episodes selected'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={clearSelection}
            disabled={selectedIndices.size === 0}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Metadata summary */}
      {Object.keys(data.metadata).length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Metadata Fields</h4>
          <div className="space-y-1">
            {Object.entries(data.metadata).map(([key, values]) => {
              const uniqueCount = new Set(values).size;
              return (
                <div key={key} className="text-sm text-gray-600">
                  <span className="font-medium">{key}:</span>{' '}
                  {typeof values[0] === 'boolean'
                    ? `${values.filter(Boolean).length} true / ${values.filter((v) => !v).length} false`
                    : `${uniqueCount} unique values`}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
