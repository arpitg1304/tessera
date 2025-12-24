// React Query hooks for sampling operations

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sampleEpisodes, exportSelection as apiExportSelection } from '../utils/api';
import { useProjectStore } from '../stores/projectStore';
import type { SamplingRequest, ExportRequest } from '../types';

export function useSampling(projectId: string | undefined) {
  const { setLastSamplingResult, setError } = useProjectStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: SamplingRequest) => {
      if (!projectId) throw new Error('No project ID');
      return sampleEpisodes(projectId, request);
    },
    onSuccess: (result) => {
      setLastSamplingResult(result);
      // Refresh selections list if we saved this selection
      if (result.selection_id) {
        queryClient.invalidateQueries({ queryKey: ['selections', projectId] });
      }
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Sampling failed');
    },
  });
}

export function useExport(projectId: string | undefined) {
  return useMutation({
    mutationFn: async (request: ExportRequest) => {
      if (!projectId) throw new Error('No project ID');
      const blob = await apiExportSelection(projectId, request);

      // Parse JSON to extract code snippet BEFORE consuming the blob
      let codeSnippet = null;
      let exportData = null;
      if (request.format === 'json') {
        const text = await blob.text();
        const data = JSON.parse(text);
        codeSnippet = data.code_snippet;
        exportData = data;

        // Create a new blob for download since we consumed the original
        const newBlob = new Blob([text], { type: 'application/json' });

        // Trigger download
        const url = window.URL.createObjectURL(newBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tessera_export_${projectId}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        // CSV format - just download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tessera_export_${projectId}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }

      return { blob, codeSnippet, exportData };
    },
  });
}
