// Control panel for visualization settings

import { useProjectStore } from '../stores/projectStore';
import type { ColorScheme, VisualizationData } from '../types';
import { Eye, EyeOff, Palette } from 'lucide-react';

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
  } = useProjectStore();

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
