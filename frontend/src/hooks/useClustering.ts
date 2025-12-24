// React Query hooks for clustering

import { useMutation } from '@tanstack/react-query';
import { clusterProject } from '../utils/api';
import { useProjectStore } from '../stores/projectStore';
import type { ClusterRequest } from '../types';

export function useClustering(projectId: string | undefined) {
  const { setClusterLabels, setClusterMetadata } = useProjectStore();

  return useMutation({
    mutationFn: async (request: ClusterRequest) => {
      if (!projectId) throw new Error('No project ID');
      return clusterProject(projectId, request);
    },
    onSuccess: (data) => {
      setClusterLabels(data.cluster_labels);
      setClusterMetadata(data.metadata);
    },
  });
}
