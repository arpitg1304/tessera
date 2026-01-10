// Thumbnail gallery component for displaying episode previews

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Grid, List, ChevronLeft, ChevronRight, X, ZoomIn, Filter } from 'lucide-react';
import type { VisualizationData } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { applyFilters } from '../utils/filtering';

interface ThumbnailGalleryProps {
  projectId: string;
  data: VisualizationData;
  hasThumbnails: boolean;
  hasGifs?: boolean;
}

const ITEMS_PER_PAGE = 24;

export function ThumbnailGallery({ projectId, data, hasThumbnails, hasGifs = false }: ThumbnailGalleryProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { metadataFilters, showSelectedOnly, selectedIndices } = useProjectStore();

  // Don't render if no thumbnails or GIFs
  if (!hasThumbnails && !hasGifs) {
    return null;
  }

  // Compute filtered indices based on metadata filters and selection
  const filteredIndices = useMemo(() => {
    // Start with all indices
    let indices = Array.from({ length: data.n_episodes }, (_, i) => i);

    // Apply metadata filters if any
    if (metadataFilters.length > 0) {
      const passedSet = applyFilters(data.metadata, metadataFilters, data.n_episodes);
      if (passedSet.size > 0) {
        indices = indices.filter(i => passedSet.has(i));
      }
    }

    // Apply selection filter if showSelectedOnly is enabled
    if (showSelectedOnly && selectedIndices.size > 0) {
      indices = indices.filter(i => selectedIndices.has(i));
    }

    return indices;
  }, [data.n_episodes, data.metadata, metadataFilters, showSelectedOnly, selectedIndices]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [metadataFilters, showSelectedOnly, selectedIndices]);

  const totalItems = filteredIndices.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const startIndex = currentPage * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
  const pageIndices = filteredIndices.slice(startIndex, endIndex);

  const isFiltered = metadataFilters.length > 0 || (showSelectedOnly && selectedIndices.size > 0);

  // Get metadata for an episode
  const getMetadata = (index: number) => {
    const meta: Record<string, string | number | boolean> = {};
    for (const [key, values] of Object.entries(data.metadata)) {
      meta[key] = values[index];
    }
    return meta;
  };

  // Format metadata value for display
  const formatValue = (_key: string, value: string | number | boolean): string => {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return value.toLocaleString();
      }
      return value.toFixed(2);
    }
    return String(value);
  };

  // Generate static thumbnail URL (first frame for GIFs, or regular thumbnail)
  const getStaticUrl = (index: number) =>
    hasGifs
      ? `/api/project/${projectId}/gif/${index}/frame`
      : `/api/project/${projectId}/thumbnail/${index}`;

  // Generate animated GIF URL
  const getGifUrl = (index: number) =>
    `/api/project/${projectId}/gif/${index}`;

  // Find position in filtered list for navigation
  const selectedFilteredPosition = selectedIndex !== null
    ? filteredIndices.indexOf(selectedIndex)
    : -1;

  // Handle keyboard navigation in lightbox (within filtered set)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (selectedIndex === null || selectedFilteredPosition === -1) return;

    if (e.key === 'Escape') {
      setSelectedIndex(null);
    } else if (e.key === 'ArrowLeft' && selectedFilteredPosition > 0) {
      e.preventDefault();
      setSelectedIndex(filteredIndices[selectedFilteredPosition - 1]);
    } else if (e.key === 'ArrowRight' && selectedFilteredPosition < filteredIndices.length - 1) {
      e.preventDefault();
      setSelectedIndex(filteredIndices[selectedFilteredPosition + 1]);
    }
  }, [selectedIndex, selectedFilteredPosition, filteredIndices]);

  // Global keyboard listener for lightbox navigation
  useEffect(() => {
    if (selectedIndex !== null) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedIndex, handleKeyDown]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Episode Gallery
          </h3>
          {isFiltered && (
            <span className="flex items-center gap-1 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full">
              <Filter className="w-3 h-3" />
              {totalItems} of {data.n_episodes}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title="Grid view"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Gallery content */}
      <div className="p-4">
        {totalItems === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            No episodes match the current filters
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid view */
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {pageIndices.map((index) => {
              const episodeId = data.episode_ids[index];
              const shortId = episodeId.split('/').pop() || episodeId;
              const isHovered = hoveredIndex === index;
              const isSelected = selectedIndices.has(index);

              return (
                <button
                  key={index}
                  onClick={() => setSelectedIndex(index)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={`group relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 hover:ring-2 hover:ring-primary-500 transition-all ${
                    isSelected ? 'ring-2 ring-yellow-400' : ''
                  }`}
                >
                  {/* Show static thumbnail by default, GIF on hover */}
                  <img
                    src={hasGifs && isHovered ? getGifUrl(index) : getStaticUrl(index)}
                    alt={`Episode ${shortId}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Overlay with episode ID */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                    <span className="text-[10px] text-white font-medium truncate block">
                      {shortId}
                    </span>
                  </div>
                  {/* Zoom icon on hover */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                    <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* List view */
          <div className="space-y-2">
            {pageIndices.map((index) => {
              const episodeId = data.episode_ids[index];
              const meta = getMetadata(index);
              const isHovered = hoveredIndex === index;
              const isSelected = selectedIndices.has(index);

              return (
                <button
                  key={index}
                  onClick={() => setSelectedIndex(index)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={`w-full flex items-center gap-4 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left ${
                    isSelected ? 'ring-2 ring-yellow-400' : ''
                  }`}
                >
                  <img
                    src={hasGifs && isHovered ? getGifUrl(index) : getStaticUrl(index)}
                    alt={`Episode ${episodeId}`}
                    className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {episodeId}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {Object.entries(meta).slice(0, 4).map(([key, value]) => (
                        <span key={key} className="text-xs text-gray-500 dark:text-gray-400">
                          <span className="text-gray-400 dark:text-gray-500">{key}:</span>{' '}
                          {formatValue(key, value)}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing {startIndex + 1}-{endIndex} of {totalItems.toLocaleString()}
            {isFiltered && <span className="text-gray-400"> (filtered)</span>}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[80px] text-center">
              Page {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage === totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox modal */}
      {selectedIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setSelectedIndex(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setSelectedIndex(null)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-8 h-8" />
          </button>

          {/* Navigation buttons (within filtered set) */}
          {selectedFilteredPosition > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIndex(filteredIndices[selectedFilteredPosition - 1]);
              }}
              className="absolute left-4 p-3 text-white/70 hover:text-white bg-black/30 hover:bg-black/50 rounded-full transition-colors"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}
          {selectedFilteredPosition < filteredIndices.length - 1 && selectedFilteredPosition !== -1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIndex(filteredIndices[selectedFilteredPosition + 1]);
              }}
              className="absolute right-4 p-3 text-white/70 hover:text-white bg-black/30 hover:bg-black/50 rounded-full transition-colors"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Image and metadata */}
          <div
            className="max-w-4xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
              {/* Large thumbnail/GIF - always show animated GIF in lightbox */}
              <div className="relative aspect-video bg-black flex items-center justify-center">
                <img
                  src={hasGifs ? getGifUrl(selectedIndex) : getStaticUrl(selectedIndex)}
                  alt={`Episode ${data.episode_ids[selectedIndex]}`}
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              {/* Episode info */}
              <div className="p-4 border-t border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-semibold text-white">
                    {data.episode_ids[selectedIndex]}
                  </h4>
                  <span className="text-sm text-gray-400">
                    {selectedFilteredPosition + 1} of {filteredIndices.length.toLocaleString()}
                    {isFiltered && ' (filtered)'}
                  </span>
                </div>

                {/* Metadata grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {Object.entries(getMetadata(selectedIndex)).map(([key, value]) => (
                    <div key={key} className="bg-gray-800 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-400 mb-0.5">{key}</p>
                      <p className="text-sm font-medium text-white">
                        {formatValue(key, value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
