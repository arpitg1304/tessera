// Sampling strategy panel

import { useState } from 'react';
import { Shuffle, Target, BarChart3, Loader2 } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useSampling } from '../hooks/useSampling';
import type { VisualizationData } from '../types';

interface SamplingPanelProps {
  projectId: string;
  data: VisualizationData;
}

type Strategy = 'kmeans' | 'stratified' | 'random';

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
  random: {
    name: 'Random',
    description: 'Random baseline sampling',
    icon: Shuffle,
  },
};

export function SamplingPanel({ projectId, data }: SamplingPanelProps) {
  const [strategy, setStrategy] = useState<Strategy>('kmeans');
  const [nSamples, setNSamples] = useState(Math.min(100, data.n_episodes));
  const [stratifyBy, setStratifyBy] = useState<string>(
    Object.keys(data.metadata)[0] || ''
  );
  const [selectionName, setSelectionName] = useState('');

  const { lastSamplingResult } = useProjectStore();
  const samplingMutation = useSampling(projectId);

  const handleSample = () => {
    samplingMutation.mutate({
      strategy,
      n_samples: nSamples,
      stratify_by: strategy === 'stratified' ? stratifyBy : undefined,
      selection_name: selectionName || undefined,
    });
  };

  const StrategyIcon = STRATEGY_INFO[strategy].icon;

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Target className="w-5 h-5" />
        Sampling
      </h3>

      {/* Strategy selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Strategy</label>
        <div className="space-y-2">
          {(Object.keys(STRATEGY_INFO) as Strategy[]).map((s) => {
            const info = STRATEGY_INFO[s];
            const Icon = info.icon;
            const isDisabled = s === 'stratified' && Object.keys(data.metadata).length === 0;

            return (
              <button
                key={s}
                onClick={() => setStrategy(s)}
                disabled={isDisabled}
                className={`
                  w-full flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left
                  ${strategy === s
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <Icon className={`w-5 h-5 mt-0.5 ${strategy === s ? 'text-primary-600' : 'text-gray-400'}`} />
                <div>
                  <p className={`font-medium ${strategy === s ? 'text-primary-900' : 'text-gray-900'}`}>
                    {info.name}
                  </p>
                  <p className="text-sm text-gray-500">{info.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stratify by (for stratified sampling) */}
      {strategy === 'stratified' && Object.keys(data.metadata).length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Stratify by
          </label>
          <select
            value={stratifyBy}
            onChange={(e) => setStratifyBy(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            {Object.keys(data.metadata).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Number of samples */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Number of Samples: {nSamples.toLocaleString()}
        </label>
        <input
          type="range"
          min={1}
          max={data.n_episodes}
          step={data.n_episodes > 100 ? Math.max(1, Math.floor(data.n_episodes / 100)) : 1}
          value={nSamples}
          onChange={(e) => setNSamples(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>1</span>
          <span>{data.n_episodes.toLocaleString()}</span>
        </div>
      </div>

      {/* Selection name (optional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Save as (optional)
        </label>
        <input
          type="text"
          value={selectionName}
          onChange={(e) => setSelectionName(e.target.value)}
          placeholder="e.g., diverse_10k"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
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
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Last Result</h4>
          <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
            <p>
              <span className="text-gray-600">Strategy:</span>{' '}
              <span className="font-medium">{lastSamplingResult.strategy}</span>
            </p>
            <p>
              <span className="text-gray-600">Samples:</span>{' '}
              <span className="font-medium">{lastSamplingResult.n_samples.toLocaleString()}</span>
            </p>
            <p>
              <span className="text-gray-600">Coverage:</span>{' '}
              <span className="font-medium text-primary-600">
                {(lastSamplingResult.coverage_score * 100).toFixed(1)}%
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
