// API client for Tessera backend

import axios from 'axios';
import type {
  Project,
  UploadResponse,
  VisualizationData,
  VisualizationStatus,
  SamplingRequest,
  SamplingResponse,
  Selection,
  ExportRequest,
  ValidationResult,
} from '../types';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Upload endpoints
export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post<UploadResponse>('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
}

export async function validateFile(file: File): Promise<ValidationResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post<ValidationResult>('/validate', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
}

// Project endpoints
export async function getProject(projectId: string): Promise<Project> {
  const response = await api.get<Project>(`/project/${projectId}`);
  return response.data;
}

export async function getProjectInfo(projectId: string): Promise<{
  project: Project;
  metadata_summary: Record<string, unknown>;
  files: Array<{ name: string; size_mb: number; modified: number }>;
  total_size_mb: number;
}> {
  const response = await api.get(`/project/${projectId}/info`);
  return response.data;
}

export async function deleteProject(projectId: string, token: string): Promise<void> {
  await api.delete(`/project/${projectId}?token=${token}`);
}

// Visualization endpoints
export async function getVisualization(projectId: string): Promise<VisualizationData> {
  const response = await api.get<VisualizationData>(`/project/${projectId}/visualization`);
  return response.data;
}

export async function getVisualizationStatus(projectId: string): Promise<VisualizationStatus> {
  const response = await api.get<VisualizationStatus>(`/project/${projectId}/visualization/status`);
  return response.data;
}

export async function triggerUmapComputation(projectId: string): Promise<{
  status: string;
  message: string;
}> {
  const response = await api.post(`/project/${projectId}/visualization/compute`);
  return response.data;
}

// Sampling endpoints
export async function sampleEpisodes(
  projectId: string,
  request: SamplingRequest
): Promise<SamplingResponse> {
  const response = await api.post<SamplingResponse>(`/project/${projectId}/sample`, request);
  return response.data;
}

export async function getProjectSelections(projectId: string): Promise<Selection[]> {
  const response = await api.get<Selection[]>(`/project/${projectId}/selections`);
  return response.data;
}

export async function getSelection(
  projectId: string,
  selectionId: number
): Promise<{
  id: number;
  selection_name: string;
  strategy: string;
  n_samples: number;
  selected_indices: number[];
  selected_episode_ids: string[];
  coverage_score: number;
  created_at: string;
}> {
  const response = await api.get(`/project/${projectId}/selection/${selectionId}`);
  return response.data;
}

// Export endpoints
export async function exportSelection(
  projectId: string,
  request: ExportRequest
): Promise<Blob> {
  const response = await api.post(`/project/${projectId}/export`, request, {
    responseType: 'blob',
  });
  return response.data;
}

// Health check
export async function healthCheck(): Promise<{
  status: string;
  version: string;
  storage_usage_percent: number;
  active_projects: number;
}> {
  const response = await axios.get('/health');
  return response.data;
}

// Error handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const message = error.response.data?.detail || error.message;
      throw new Error(message);
    }
    throw error;
  }
);

export default api;
