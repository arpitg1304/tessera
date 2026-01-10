// Main 2D scatter plot visualization using deck.gl

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import { OrthographicView } from '@deck.gl/core';
import { useProjectStore } from '../stores/projectStore';
import type { VisualizationData, ColorScheme } from '../types';
import { applyFilters } from '../utils/filtering';
import { SelectionOverlay, BoxRegion, LassoRegion } from './SelectionOverlay';
import { isPointInBox, isPointInPolygon } from '../utils/selectionGeometry';
import { useSimilarity } from '../hooks/useSimilarity';
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  MousePointer2,
  Hand,
  Square,
  Lasso,
  Sparkles,
} from 'lucide-react';

interface ScatterPlotProps {
  data: VisualizationData;
  width?: number;
  height?: number;
  projectId?: string;
  hasThumbnails?: boolean;
  hasGifs?: boolean;
}

// Color palettes
const COLORS = {
  default: [100, 149, 237, 200] as [number, number, number, number], // Cornflower blue
  selected: [255, 200, 0, 255] as [number, number, number, number], // Gold
  similar: [147, 51, 234, 200] as [number, number, number, number], // Purple for similar
  success: [34, 197, 94, 200] as [number, number, number, number], // Green
  failure: [239, 68, 68, 200] as [number, number, number, number], // Red
};

// Task/Dataset colors (for categorical coloring)
const CATEGORY_COLORS: [number, number, number, number][] = [
  [59, 130, 246, 200],   // Blue
  [16, 185, 129, 200],   // Emerald
  [249, 115, 22, 200],   // Orange
  [139, 92, 246, 200],   // Purple
  [236, 72, 153, 200],   // Pink
  [20, 184, 166, 200],   // Teal
  [245, 158, 11, 200],   // Amber
  [99, 102, 241, 200],   // Indigo
];

// Cluster colors (for cluster visualization)
const CLUSTER_COLORS: [number, number, number, number][] = [
  [59, 130, 246, 200],   // Blue
  [16, 185, 129, 200],   // Emerald
  [249, 115, 22, 200],   // Orange
  [139, 92, 246, 200],   // Purple
  [236, 72, 153, 200],   // Pink
  [20, 184, 166, 200],   // Teal
  [245, 158, 11, 200],   // Amber
  [99, 102, 241, 200],   // Indigo
  [220, 38, 38, 200],    // Red
  [34, 197, 94, 200],    // Green
  [251, 191, 36, 200],   // Yellow
  [168, 85, 247, 200],   // Violet
];

// Noise cluster color (for DBSCAN noise points)
const NOISE_COLOR: [number, number, number, number] = [156, 163, 175, 150]; // Gray

// Get color index for a category value (for legend)
function getCategoryColorIndex(value: string): number {
  const hash = String(value).split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  return Math.abs(hash) % CATEGORY_COLORS.length;
}

function getColor(
  index: number,
  metadata: Record<string, (string | number | boolean)[]>,
  colorBy: ColorScheme,
  isSelected: boolean,
  isSimilar: boolean,
  clusterLabels: number[] | null
): [number, number, number, number] {
  if (isSelected) {
    return COLORS.selected;
  }

  if (isSimilar) {
    return COLORS.similar;
  }

  switch (colorBy) {
    case 'success': {
      const success = metadata.success?.[index];
      if (success === undefined) return COLORS.default;
      return success ? COLORS.success : COLORS.failure;
    }
    case 'task':
    case 'dataset': {
      const value = colorBy === 'dataset' ? metadata.dataset?.[index] : metadata.task?.[index];
      if (value === undefined) return COLORS.default;
      return CATEGORY_COLORS[getCategoryColorIndex(String(value))];
    }
    case 'episode_length': {
      const length = metadata.episode_length?.[index] as number | undefined;
      if (length === undefined) return COLORS.default;
      // Normalize to 0-1 range (assuming max 500 frames)
      const normalized = Math.min(length / 500, 1);
      // Blue to red gradient
      return [
        Math.round(normalized * 239),
        Math.round((1 - normalized) * 149 + normalized * 68),
        Math.round((1 - normalized) * 237 + normalized * 68),
        200,
      ];
    }
    case 'cluster': {
      if (!clusterLabels || clusterLabels[index] === undefined) return COLORS.default;
      const label = clusterLabels[index];
      // -1 indicates noise in DBSCAN
      if (label === -1) return NOISE_COLOR;
      return CLUSTER_COLORS[label % CLUSTER_COLORS.length];
    }
    default:
      return COLORS.default;
  }
}

// Convert RGBA array to CSS color
function rgbaToCSS(color: [number, number, number, number]): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
}

export function ScatterPlot({ data, width = 800, height = 600, projectId, hasThumbnails = false, hasGifs = false }: ScatterPlotProps) {
  const { selectedIndices, toggleSelection, colorBy, showSelectedOnly, metadataFilters, selectByRegion, clearSelection, clusterLabels } = useProjectStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan' | 'box' | 'lasso' | 'similar'>('select');
  const [viewState, setViewState] = useState<any>(null);
  const [modifierKey, setModifierKey] = useState<'shift' | 'alt' | null>(null);
  const [similarIndices, setSimilarIndices] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<any>(null);

  // Similarity search hook
  const { findSimilar, isLoading: isFindingSimilar } = projectId
    ? useSimilarity(projectId)
    : { findSimilar: null, isLoading: false };

  // Calculate initial view bounds
  const initialViewState = useMemo(() => {
    const xs = data.coordinates.map((c) => c[0]);
    const ys = data.coordinates.map((c) => c[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const currentWidth = isFullscreen ? window.innerWidth : width;
    const currentHeight = isFullscreen ? window.innerHeight : height;
    const zoom = Math.min(currentWidth / rangeX, currentHeight / rangeY) * 0.8;

    return {
      target: [centerX, centerY, 0],
      zoom: Math.log2(zoom),
      minZoom: -2,
      maxZoom: 20,
    };
  }, [data.coordinates, width, height, isFullscreen]);

  // Initialize view state
  useEffect(() => {
    if (!viewState) {
      setViewState(initialViewState);
    }
  }, [initialViewState, viewState]);

  // Transform data for deck.gl
  const points = useMemo(() => {
    // Apply metadata filters first
    const filteredIndices = applyFilters(data.metadata, metadataFilters, data.n_episodes);

    return data.coordinates
      .map((coord, idx) => ({
        position: coord as [number, number],
        id: data.episode_ids[idx],
        index: idx,
        selected: selectedIndices.has(idx),
        similar: similarIndices.has(idx),
      }))
      .filter((point) => {
        // Apply metadata filters
        if (metadataFilters.length > 0 && !filteredIndices.has(point.index)) {
          return false;
        }
        // Apply "show selected only"
        if (showSelectedOnly && !point.selected) {
          return false;
        }
        return true;
      });
  }, [data, selectedIndices, showSelectedOnly, metadataFilters, similarIndices]);

  const metadata = data.metadata;

  // Get unique categories for legend
  const legendItems = useMemo(() => {
    if (colorBy === 'none') return [];

    if (colorBy === 'success') {
      return [
        { label: 'Success', color: COLORS.success },
        { label: 'Failure', color: COLORS.failure },
      ];
    }

    if (colorBy === 'task' || colorBy === 'dataset') {
      const key = colorBy === 'dataset' ? 'dataset' : 'task';
      const values = metadata[key];
      if (!values) return [];

      const unique = [...new Set(values.map(String))].sort();
      return unique.map(value => ({
        label: value,
        color: CATEGORY_COLORS[getCategoryColorIndex(value)],
      }));
    }

    if (colorBy === 'episode_length') {
      return [
        { label: 'Short', color: [100, 149, 237, 200] as [number, number, number, number] },
        { label: 'Long', color: [239, 68, 68, 200] as [number, number, number, number] },
      ];
    }

    if (colorBy === 'cluster') {
      if (!clusterLabels) return [];
      const uniqueClusters = [...new Set(clusterLabels)].sort((a, b) => a - b);
      return uniqueClusters.map(label => ({
        label: label === -1 ? 'Noise' : `Cluster ${label}`,
        color: label === -1 ? NOISE_COLOR : CLUSTER_COLORS[label % CLUSTER_COLORS.length],
      }));
    }

    return [];
  }, [colorBy, metadata, clusterLabels]);

  // Handle click
  const onClick = useCallback(
    async (info: { object?: { index: number } }) => {
      if (!info.object) return;

      if (interactionMode === 'select') {
        toggleSelection(info.object.index);
      } else if (interactionMode === 'similar' && findSimilar) {
        // Find similar episodes to the clicked one
        try {
          const result = await findSimilar([info.object.index], 20);
          setSimilarIndices(new Set(result.similar_indices));

          // Only select if modifier key is pressed
          if (modifierKey === 'shift') {
            selectByRegion(result.similar_indices, 'add');
          } else if (modifierKey === 'alt') {
            selectByRegion(result.similar_indices, 'remove');
          }
          // No modifier = just highlight in purple, don't select
        } catch (error) {
          console.error('Failed to find similar episodes:', error);
        }
      }
    },
    [toggleSelection, interactionMode, findSimilar, modifierKey, selectByRegion]
  );

  // Handle region selection (box or lasso)
  const handleRegionSelection = useCallback(
    (region: BoxRegion | LassoRegion) => {
      if (!viewState) return;

      // Get the deck.gl viewport for accurate coordinate transformation
      const deck = deckRef.current?.deck;
      if (!deck) return;

      const viewport = deck.getViewports()[0];
      if (!viewport) return;

      // Find all points within the region
      const selectedPointIndices: number[] = [];

      data.coordinates.forEach((coord, idx) => {
        // Use deck.gl's project method for accurate screen coordinate conversion
        const screenPoint = viewport.project([coord[0], coord[1], 0]);

        // Check if point is in region
        let isInside = false;
        if (region.type === 'box') {
          isInside = isPointInBox([screenPoint[0], screenPoint[1]], region);
        } else if (region.type === 'lasso') {
          isInside = isPointInPolygon([screenPoint[0], screenPoint[1]], region.points);
        }

        if (isInside) {
          selectedPointIndices.push(idx);
        }
      });

      // Determine selection mode based on modifier keys
      const mode = modifierKey === 'shift' ? 'add' : modifierKey === 'alt' ? 'remove' : 'replace';
      selectByRegion(selectedPointIndices, mode);
    },
    [data.coordinates, viewState, width, height, isFullscreen, modifierKey, selectByRegion]
  );

  // Create layer
  const layers = useMemo(() => {
    return [
      new ScatterplotLayer({
        id: 'episodes',
        data: points,
        getPosition: (d: { position: [number, number] }) => d.position,
        getFillColor: (d: { index: number; selected: boolean; similar: boolean }) =>
          getColor(d.index, data.metadata, colorBy, d.selected, d.similar, clusterLabels),
        getRadius: (d: { selected: boolean; similar: boolean }) => (d.selected ? 8 : d.similar ? 6 : 5),
        radiusUnits: 'pixels',
        pickable: interactionMode === 'select' || interactionMode === 'similar',
        autoHighlight: interactionMode === 'select' || interactionMode === 'similar',
        highlightColor: [255, 255, 255, 100],
        onClick,
        updateTriggers: {
          getFillColor: [colorBy, selectedIndices, similarIndices, clusterLabels],
          getRadius: [selectedIndices, similarIndices],
        },
      }),
    ];
  }, [points, data.metadata, colorBy, selectedIndices, similarIndices, onClick, interactionMode]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (viewState) {
      setViewState({ ...viewState, zoom: viewState.zoom + 0.5 });
    }
  }, [viewState]);

  const handleZoomOut = useCallback(() => {
    if (viewState) {
      setViewState({ ...viewState, zoom: viewState.zoom - 0.5 });
    }
  }, [viewState]);

  const handleResetView = useCallback(() => {
    setViewState(initialViewState);
  }, [initialViewState]);

  // Export as PNG
  const handleExport = useCallback(() => {
    if (deckRef.current) {
      const canvas = containerRef.current?.querySelector('canvas');
      if (canvas) {
        const link = document.createElement('a');
        link.download = 'tessera-visualization.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    }
  }, []);

  // Track modifier keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) {
        setModifierKey('shift');
      } else if (e.altKey) {
        setModifierKey('alt');
      }
    };

    const handleKeyUp = () => {
      setModifierKey(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Mode shortcuts
      if (e.key === 'b' || e.key === 'B') {
        setInteractionMode('box');
      } else if (e.key === 'l' || e.key === 'L') {
        setInteractionMode('lasso');
      } else if (e.key === 's' || e.key === 'S') {
        setInteractionMode('select');
      } else if (e.key === 'p' || e.key === 'P') {
        setInteractionMode('pan');
      } else if ((e.key === 'n' || e.key === 'N') && projectId) {
        setInteractionMode('similar');
        setSimilarIndices(new Set()); // Clear previous similar results
      }
      // Selection shortcuts
      else if (e.key === 'c' || e.key === 'C') {
        clearSelection();
        setSimilarIndices(new Set()); // Also clear similar highlights
      }
      // Other shortcuts
      else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === 'r' || e.key === 'R') {
        handleResetView();
      } else if (e.key === 'Escape' && isFullscreen) {
        document.exitFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleFullscreen, handleZoomIn, handleZoomOut, handleResetView, isFullscreen, clearSelection]);

  const currentWidth = isFullscreen ? '100vw' : width;
  const currentHeight = isFullscreen ? '100vh' : height;

  const currentWidthNum = isFullscreen ? window.innerWidth : width;
  const currentHeightNum = isFullscreen ? window.innerHeight : height;

  return (
    <div
      ref={containerRef}
      className={`relative bg-gray-900 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : 'rounded-lg'} ${interactionMode === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      style={{ width: currentWidth, height: currentHeight }}
    >
      <DeckGL
        ref={deckRef}
        views={new OrthographicView({ id: 'ortho' })}
        initialViewState={viewState || initialViewState}
        onViewStateChange={(e: any) => setViewState(e.viewState)}
        controller={{
          dragPan: true,
          dragRotate: false,
          scrollZoom: true,
          doubleClickZoom: true,
          touchZoom: true,
          touchRotate: false,
          keyboard: false,
        }}
        layers={layers}
        getTooltip={({ object }: { object?: { id: string; index: number } }) => {
          if (!object) return null;
          const meta = Object.entries(data.metadata)
            .map(([key, values]) => `${key}: ${values[object.index]}`)
            .join('\n');

          // If GIFs or thumbnails available, use HTML tooltip with image
          if ((hasGifs || hasThumbnails) && projectId) {
            // Prefer GIF if available, otherwise use thumbnail
            const imageUrl = hasGifs
              ? `/api/project/${projectId}/gif/${object.index}`
              : `/api/project/${projectId}/thumbnail/${object.index}`;
            const metaHtml = Object.entries(data.metadata)
              .map(([key, values]) => `<div><span style="color:#9ca3af">${key}:</span> ${values[object.index]}</div>`)
              .join('');
            return {
              html: `
                <div style="display:flex;gap:12px;align-items:flex-start;">
                  <img src="${imageUrl}"
                       style="width:128px;height:128px;object-fit:cover;border-radius:4px;flex-shrink:0;"
                       onerror="this.style.display='none'" />
                  <div>
                    <div style="font-weight:600;margin-bottom:4px;">${object.id}</div>
                    <div style="color:#9ca3af;font-size:11px;margin-bottom:8px;">Index: ${object.index}</div>
                    <div style="font-size:11px;line-height:1.5;">${metaHtml}</div>
                  </div>
                </div>
              `,
              style: {
                backgroundColor: 'rgba(0,0,0,0.95)',
                color: 'white',
                fontSize: '12px',
                padding: '12px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                maxWidth: '400px',
              },
            };
          }

          // Text-only tooltip (no thumbnails or GIFs)
          return {
            text: `Episode: ${object.id}\nIndex: ${object.index}\n${meta}`,
            style: {
              backgroundColor: 'rgba(0,0,0,0.9)',
              color: 'white',
              fontSize: '12px',
              padding: '10px 12px',
              borderRadius: '6px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
              maxWidth: '300px',
              whiteSpace: 'pre-wrap',
            },
          };
        }}
      />

      {/* Selection Overlay for box/lasso modes */}
      {(interactionMode === 'box' || interactionMode === 'lasso') && (
        <SelectionOverlay
          mode={interactionMode}
          width={currentWidthNum}
          height={currentHeightNum}
          onSelectionComplete={handleRegionSelection}
          modifierKey={modifierKey}
        />
      )}

      {/* Toolbar */}
      <div className="absolute top-4 right-4 flex flex-col gap-1 bg-black/70 rounded-lg p-1 z-10">
        {/* Point selection mode */}
        <button
          onClick={() => setInteractionMode('select')}
          className={`p-2 rounded transition-colors ${
            interactionMode === 'select' ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-white/10'
          }`}
          title="Point selection (S)"
        >
          <MousePointer2 className="w-4 h-4" />
        </button>

        {/* Pan mode */}
        <button
          onClick={() => setInteractionMode('pan')}
          className={`p-2 rounded transition-colors ${
            interactionMode === 'pan' ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-white/10'
          }`}
          title="Pan mode (P)"
        >
          <Hand className="w-4 h-4" />
        </button>

        <div className="border-t border-white/20 my-1" />

        {/* Box selection mode */}
        <button
          onClick={() => setInteractionMode('box')}
          className={`p-2 rounded transition-colors ${
            interactionMode === 'box' ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-white/10'
          }`}
          title="Box selection (B)"
        >
          <Square className="w-4 h-4" />
        </button>

        {/* Lasso selection mode */}
        <button
          onClick={() => setInteractionMode('lasso')}
          className={`p-2 rounded transition-colors ${
            interactionMode === 'lasso' ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-white/10'
          }`}
          title="Lasso selection (L)"
        >
          <Lasso className="w-4 h-4" />
        </button>

        {/* Find similar mode */}
        {projectId && (
          <button
            onClick={() => {
              setInteractionMode('similar');
              setSimilarIndices(new Set());
            }}
            className={`p-2 rounded transition-colors ${
              interactionMode === 'similar' ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-white/10'
            } ${isFindingSimilar ? 'opacity-50' : ''}`}
            title="Find similar (N)"
            disabled={isFindingSimilar}
          >
            <Sparkles className="w-4 h-4" />
          </button>
        )}

        <div className="border-t border-white/20 my-1" />

        {/* Zoom controls */}
        <button
          onClick={handleZoomIn}
          className="p-2 text-gray-300 hover:bg-white/10 rounded transition-colors"
          title="Zoom in (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 text-gray-300 hover:bg-white/10 rounded transition-colors"
          title="Zoom out (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          className="p-2 text-gray-300 hover:bg-white/10 rounded transition-colors"
          title="Reset view (R)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="border-t border-white/20 my-1" />

        {/* Export */}
        <button
          onClick={handleExport}
          className="p-2 text-gray-300 hover:bg-white/10 rounded transition-colors"
          title="Export as PNG"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="p-2 text-gray-300 hover:bg-white/10 rounded transition-colors"
          title={isFullscreen ? 'Exit fullscreen (F/Esc)' : 'Fullscreen (F)'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Legend */}
      {legendItems.length > 0 && (
        <div className="absolute top-4 left-4 bg-black/70 rounded-lg p-3 max-h-48 overflow-y-auto z-10">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            {colorBy === 'dataset' ? 'Dataset' : colorBy === 'task' ? 'Task' : colorBy === 'success' ? 'Status' : 'Length'}
          </div>
          <div className="space-y-1">
            {legendItems.slice(0, 10).map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm text-white">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: rgbaToCSS(item.color) }}
                />
                <span className="truncate max-w-[120px]" title={item.label}>
                  {item.label}
                </span>
              </div>
            ))}
            {legendItems.length > 10 && (
              <div className="text-xs text-gray-400">
                +{legendItems.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats overlay */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white text-sm px-3 py-2 rounded flex items-center gap-4 z-10">
        <span>
          {metadataFilters.length > 0 || showSelectedOnly
            ? `Showing ${points.length.toLocaleString()} of ${data.n_episodes.toLocaleString()}`
            : `${data.n_episodes.toLocaleString()} episodes`}
        </span>
        {metadataFilters.length > 0 && (
          <>
            <span className="text-gray-400">|</span>
            <span className="text-blue-400">
              {metadataFilters.length} filter{metadataFilters.length !== 1 ? 's' : ''} active
            </span>
          </>
        )}
        {similarIndices.size > 0 && (
          <>
            <span className="text-gray-400">|</span>
            <span className="text-purple-400">
              {similarIndices.size.toLocaleString()} similar
            </span>
          </>
        )}
        {selectedIndices.size > 0 && (
          <>
            <span className="text-gray-400">|</span>
            <span className="text-yellow-400">
              {selectedIndices.size.toLocaleString()} selected
            </span>
          </>
        )}
      </div>

      {/* Keyboard shortcuts hint */}
      {isFullscreen && (
        <div className="absolute bottom-4 right-4 bg-black/70 text-gray-400 text-xs px-3 py-2 rounded max-w-xs">
          <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">Shortcuts:</div>
          <div className="space-y-0.5">
            <div>S select • P pan • B box • L lasso{projectId && ' • N similar'}</div>
            <div>Shift add • Alt remove • C clear</div>
            <div>F fullscreen • +/- zoom • R reset</div>
          </div>
        </div>
      )}
    </div>
  );
}
