// Export dialog component

import { useState } from 'react';
import { X, Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useExport } from '../hooks/useSampling';

interface ExportModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ projectId, isOpen, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [includeMetadata, setIncludeMetadata] = useState(true);

  const { selectedIndices, lastSamplingResult } = useProjectStore();
  const exportMutation = useExport(projectId);

  if (!isOpen) return null;

  const hasSelection = selectedIndices.size > 0;
  const selectionId = lastSamplingResult?.selection_id;

  const handleExport = async () => {
    await exportMutation.mutateAsync({
      format,
      selected_indices: hasSelection ? Array.from(selectedIndices) : undefined,
      selection_id: !hasSelection && selectionId ? selectionId : undefined,
      include_metadata: includeMetadata,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Download className="w-6 h-6" />
            Export Selection
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Selection summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              {hasSelection ? (
                <>Exporting <strong>{selectedIndices.size.toLocaleString()}</strong> selected episodes</>
              ) : selectionId ? (
                <>Exporting last sampling result ({lastSamplingResult?.n_samples.toLocaleString()} episodes)</>
              ) : (
                <span className="text-yellow-600">No episodes selected. Please select episodes first.</span>
              )}
            </p>
          </div>

          {/* Format selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormat('json')}
                className={`
                  flex items-center gap-2 p-3 rounded-lg border-2 transition-all
                  ${format === 'json'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                <FileJson className={`w-5 h-5 ${format === 'json' ? 'text-primary-600' : 'text-gray-400'}`} />
                <span className={format === 'json' ? 'text-primary-900' : 'text-gray-700'}>JSON</span>
              </button>
              <button
                onClick={() => setFormat('csv')}
                className={`
                  flex items-center gap-2 p-3 rounded-lg border-2 transition-all
                  ${format === 'csv'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                <FileSpreadsheet className={`w-5 h-5 ${format === 'csv' ? 'text-primary-600' : 'text-gray-400'}`} />
                <span className={format === 'csv' ? 'text-primary-900' : 'text-gray-700'}>CSV</span>
              </button>
            </div>
          </div>

          {/* Include metadata toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Include metadata</span>
            <button
              onClick={() => setIncludeMetadata(!includeMetadata)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${includeMetadata ? 'bg-primary-600' : 'bg-gray-200'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${includeMetadata ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          {/* What's included */}
          <div className="text-sm text-gray-500">
            <p className="font-medium mb-1">Export will include:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Episode IDs</li>
              <li>Episode indices</li>
              {includeMetadata && <li>All metadata fields</li>}
              {format === 'json' && <li>Python code snippet</li>}
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={(!hasSelection && !selectionId) || exportMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
