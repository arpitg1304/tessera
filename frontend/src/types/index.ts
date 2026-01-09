// Tessera Frontend Types

export interface Project {
  id: string;
  n_episodes: number;
  embedding_dim: number;
  has_success_labels: boolean;
  has_task_labels: boolean;
  has_episode_length: boolean;
  dataset_name: string | null;
  description: string | null;
  created_at: string;
  expires_at: string;
}

export interface UploadResponse {
  project_id: string;
  view_url: string;
  edit_url: string;
  n_episodes: number;
  embedding_dim: number;
  expires_at: string;
  message: string;
}

export interface VisualizationData {
  coordinates: number[][];
  episode_ids: string[];
  metadata: Record<string, (string | number | boolean)[]>;
  n_episodes: number;
  umap_cached: boolean;
}

export interface VisualizationStatus {
  status: 'ready' | 'computing' | 'pending' | 'error';
  progress?: number;
  message?: string;
}

export interface SamplingRequest {
  strategy: 'kmeans' | 'stratified' | 'random';
  n_samples: number;
  stratify_by?: string;
  random_seed?: number;
  selection_name?: string;
  filter_indices?: number[];  // If provided, sample only from these indices
}

export interface SamplingResponse {
  selected_indices: number[];
  selected_episode_ids: string[];
  n_samples: number;
  strategy: string;
  coverage_score: number;
  selection_id?: number;
}

export interface Selection {
  id: number;
  selection_name: string;
  strategy: string;
  n_samples: number;
  coverage_score: number | null;
  created_at: string;
}

export interface ExportRequest {
  format: 'json' | 'csv';
  selected_indices?: number[];
  selection_id?: number;
  include_metadata?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  n_episodes: number;
  embedding_dim: number;
  has_success: boolean;
  has_task: boolean;
  has_episode_length: boolean;
  has_dataset: boolean;
  metadata_fields: string[];
  errors: string[];
  warnings: string[];
}

export interface MetadataSummary {
  [key: string]: {
    dtype: string;
    count: number;
    type: string;
    true_count?: number;
    false_count?: number;
    min?: number;
    max?: number;
    mean?: number;
    unique_count?: number;
    categories?: string[];
  };
}

// Point data for scatter plot
export interface EpisodePoint {
  position: [number, number];
  id: string;
  index: number;
  color: [number, number, number, number];
  selected: boolean;
  metadata: Record<string, string | number | boolean>;
}

// Color schemes
export type ColorScheme = 'success' | 'task' | 'episode_length' | 'dataset' | 'cluster' | 'none';

// Clustering
export interface ClusterRequest {
  method: 'kmeans' | 'dbscan';
  n_clusters?: number; // For kmeans, auto-select if not provided
  min_cluster_size?: number; // For DBSCAN
  min_samples?: number; // For DBSCAN
}

export interface ClusterMetadata {
  method: string;
  n_clusters: number;
  cluster_sizes: Record<string, number>;
  inertia?: number; // For kmeans
  n_noise?: number; // For DBSCAN
  noise_ratio?: number; // For DBSCAN
  eps?: number; // For DBSCAN
  min_samples?: number; // For DBSCAN
}

export interface ClusterResponse {
  cluster_labels: number[];
  episode_ids: string[];
  metadata: ClusterMetadata;
}
