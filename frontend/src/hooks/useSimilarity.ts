// Hook for finding similar episodes

import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface SimilarityRequest {
  source_indices: number[];
  k?: number;
  include_distances?: boolean;
}

interface SimilarityResponse {
  similar_indices: number[];
  n_results: number;
  distances?: number[];
}

export function useSimilarity(projectId: string) {
  const findSimilarMutation = useMutation({
    mutationFn: async (request: SimilarityRequest) => {
      const response = await api.post<SimilarityResponse>(
        `/projects/${projectId}/similar`,
        request
      );
      return response.data;
    },
  });

  const findSimilar = async (
    sourceIndices: number[],
    k: number = 10,
    includeDistances: boolean = false
  ) => {
    return findSimilarMutation.mutateAsync({
      source_indices: sourceIndices,
      k,
      include_distances: includeDistances,
    });
  };

  return {
    findSimilar,
    isLoading: findSimilarMutation.isPending,
    error: findSimilarMutation.error,
  };
}
