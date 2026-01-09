// Selection statistics panel component

import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { computeSelectionStats } from '../utils/statistics';
import type { VisualizationData } from '../types';

interface SelectionStatsProps {
  data: VisualizationData;
  selectedIndices: Set<number>;
}

export function SelectionStats({ data, selectedIndices }: SelectionStatsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const stats = useMemo(() => {
    return computeSelectionStats(data.metadata, selectedIndices);
  }, [data.metadata, selectedIndices]);

  if (selectedIndices.size === 0 || stats.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between hover:opacity-70 transition-opacity"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Selection Stats
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            ({selectedIndices.size.toLocaleString()})
          </span>
        </h3>
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Episode count */}
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {selectedIndices.size.toLocaleString()} episode{selectedIndices.size !== 1 ? 's' : ''} selected
          </div>

          {/* Statistics by field */}
          <div className="space-y-4">
        {stats.map((fieldStat) => (
          <div key={fieldStat.field} className="border-t pt-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 capitalize">
              {fieldStat.field.replace(/_/g, ' ')}
            </h4>

            {/* Boolean field stats */}
            {fieldStat.type === 'boolean' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">True</span>
                  <span className="font-medium text-green-600">
                    {fieldStat.trueCount} ({fieldStat.truePercent}%)
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">False</span>
                  <span className="font-medium text-red-600">
                    {fieldStat.falseCount} ({fieldStat.falsePercent}%)
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${fieldStat.truePercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Numeric field stats */}
            {fieldStat.type === 'numeric' && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-300">Min:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-white">{fieldStat.min?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-300">Max:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-white">{fieldStat.max?.toFixed(2)}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600 dark:text-gray-300">Mean:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-white">{fieldStat.mean?.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Categorical field stats */}
            {fieldStat.type === 'categorical' && fieldStat.categories && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {fieldStat.categories.slice(0, 5).map((cat) => (
                  <div key={cat.value} className="flex items-center justify-between text-sm">
                    <span
                      className="text-gray-600 dark:text-gray-400 truncate max-w-[140px]"
                      title={cat.value}
                    >
                      {cat.value}
                    </span>
                    <span className="font-medium text-primary-600">
                      {cat.count} ({cat.percent.toFixed(1)}%)
                    </span>
                  </div>
                ))}
                {fieldStat.categories.length > 5 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                    +{fieldStat.categories.length - 5} more categor{fieldStat.categories.length - 5 === 1 ? 'y' : 'ies'}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
          </div>
        </div>
      )}
    </div>
  );
}
