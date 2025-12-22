// React Query hooks for project data fetching

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProject,
  getVisualization,
  getVisualizationStatus,
  triggerUmapComputation,
  getProjectSelections,
  uploadFile,
} from '../utils/api';
import { useProjectStore } from '../stores/projectStore';

export function useProject(projectId: string | undefined) {
  const setProject = useProjectStore((state) => state.setProject);

  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      const project = await getProject(projectId);
      setProject(project);
      return project;
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useVisualization(projectId: string | undefined) {
  const { setVisualizationData, setVisualizationLoading } = useProjectStore();

  return useQuery({
    queryKey: ['visualization', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      setVisualizationLoading(true);
      try {
        const data = await getVisualization(projectId);
        setVisualizationData(data);
        return data;
      } finally {
        setVisualizationLoading(false);
      }
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 30, // 30 minutes (UMAP doesn't change)
    retry: 2,
  });
}

export function useVisualizationStatus(projectId: string | undefined) {
  return useQuery({
    queryKey: ['visualization-status', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      return getVisualizationStatus(projectId);
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      // Poll while computing
      const data = query.state.data;
      if (data?.status === 'computing' || data?.status === 'pending') {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });
}

export function useTriggerUmap(projectId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('No project ID');
      return triggerUmapComputation(projectId);
    },
    onSuccess: () => {
      // Invalidate status to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['visualization-status', projectId] });
    },
  });
}

export function useProjectSelections(projectId: string | undefined) {
  const setSavedSelections = useProjectStore((state) => state.setSavedSelections);

  return useQuery({
    queryKey: ['selections', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      const selections = await getProjectSelections(projectId);
      setSavedSelections(selections);
      return selections;
    },
    enabled: !!projectId,
  });
}

export function useUpload() {
  const { setIsUploading, setUploadProgress, setError } = useProjectStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      try {
        const result = await uploadFile(file);
        setUploadProgress(100);
        return result;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Upload failed');
        throw error;
      } finally {
        setIsUploading(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
