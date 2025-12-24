// Zustand store for project state management

import { create } from 'zustand';
import type {
  Project,
  VisualizationData,
  SamplingResponse,
  Selection,
  ColorScheme,
} from '../types';
import type { MetadataFilter } from '../utils/filtering';

interface ProjectState {
  // Current project
  project: Project | null;
  setProject: (project: Project | null) => void;

  // Visualization data
  visualizationData: VisualizationData | null;
  setVisualizationData: (data: VisualizationData | null) => void;
  isVisualizationLoading: boolean;
  setVisualizationLoading: (loading: boolean) => void;

  // Selection state
  selectedIndices: Set<number>;
  setSelectedIndices: (indices: Set<number>) => void;
  toggleSelection: (index: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  selectIndices: (indices: number[]) => void;
  selectByRegion: (indices: number[], mode: 'replace' | 'add' | 'remove') => void;

  // Sampling results
  lastSamplingResult: SamplingResponse | null;
  setLastSamplingResult: (result: SamplingResponse | null) => void;
  savedSelections: Selection[];
  setSavedSelections: (selections: Selection[]) => void;

  // Visualization settings
  colorBy: ColorScheme;
  setColorBy: (scheme: ColorScheme) => void;
  showSelectedOnly: boolean;
  setShowSelectedOnly: (show: boolean) => void;

  // Metadata filters
  metadataFilters: MetadataFilter[];
  addMetadataFilter: (filter: MetadataFilter) => void;
  removeMetadataFilter: (index: number) => void;
  clearMetadataFilters: () => void;
  setMetadataFilters: (filters: MetadataFilter[]) => void;

  // UI state
  isUploading: boolean;
  setIsUploading: (uploading: boolean) => void;
  uploadProgress: number;
  setUploadProgress: (progress: number) => void;
  error: string | null;
  setError: (error: string | null) => void;

  // Reset state
  reset: () => void;
}

const initialState = {
  project: null,
  visualizationData: null,
  isVisualizationLoading: false,
  selectedIndices: new Set<number>(),
  lastSamplingResult: null,
  savedSelections: [],
  colorBy: 'none' as ColorScheme,
  showSelectedOnly: false,
  metadataFilters: [] as MetadataFilter[],
  isUploading: false,
  uploadProgress: 0,
  error: null,
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  ...initialState,

  setProject: (project) => set({ project }),

  setVisualizationData: (data) => set({ visualizationData: data }),
  setVisualizationLoading: (loading) => set({ isVisualizationLoading: loading }),

  setSelectedIndices: (indices) => set({ selectedIndices: indices }),

  toggleSelection: (index) => {
    const current = get().selectedIndices;
    const newSet = new Set(current);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    set({ selectedIndices: newSet });
  },

  selectAll: () => {
    const data = get().visualizationData;
    if (data) {
      const allIndices = new Set(Array.from({ length: data.n_episodes }, (_, i) => i));
      set({ selectedIndices: allIndices });
    }
  },

  clearSelection: () => set({ selectedIndices: new Set() }),

  selectIndices: (indices) => set({ selectedIndices: new Set(indices) }),

  selectByRegion: (indices, mode) => {
    const current = get().selectedIndices;
    let newSet: Set<number>;

    if (mode === 'replace') {
      newSet = new Set(indices);
    } else if (mode === 'add') {
      newSet = new Set(current);
      indices.forEach((idx) => newSet.add(idx));
    } else {
      // mode === 'remove'
      newSet = new Set(current);
      indices.forEach((idx) => newSet.delete(idx));
    }

    set({ selectedIndices: newSet });
  },

  setLastSamplingResult: (result) => {
    set({ lastSamplingResult: result });
    if (result) {
      set({ selectedIndices: new Set(result.selected_indices) });
    }
  },

  setSavedSelections: (selections) => set({ savedSelections: selections }),

  setColorBy: (scheme) => set({ colorBy: scheme }),
  setShowSelectedOnly: (show) => set({ showSelectedOnly: show }),

  addMetadataFilter: (filter) => {
    const current = get().metadataFilters;
    set({ metadataFilters: [...current, filter] });
  },

  removeMetadataFilter: (index) => {
    const current = get().metadataFilters;
    set({ metadataFilters: current.filter((_, i) => i !== index) });
  },

  clearMetadataFilters: () => set({ metadataFilters: [] }),

  setMetadataFilters: (filters) => set({ metadataFilters: filters }),

  setIsUploading: (uploading) => set({ isUploading: uploading }),
  setUploadProgress: (progress) => set({ uploadProgress: progress }),
  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
