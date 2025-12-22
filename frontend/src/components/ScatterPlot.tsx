// Main 2D scatter plot visualization using deck.gl

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import { OrthographicView } from '@deck.gl/core';
import { useProjectStore } from '../stores/projectStore';
import type { VisualizationData, ColorScheme } from '../types';
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  MousePointer2,
  Hand,
} from 'lucide-react';

interface ScatterPlotProps {
  data: VisualizationData;
  width?: number;
  height?: number;
}

// Color palettes
const COLORS = {
  default: [100, 149, 237, 200] as [number, number, number, number], // Cornflower blue
  selected: [255, 200, 0, 255] as [number, number, number, number], // Gold
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
  isSelected: boolean
): [number, number, number, number] {
  if (isSelected) {
    return COLORS.selected;
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
    default:
      return COLORS.default;
  }
}

// Convert RGBA array to CSS color
function rgbaToCSS(color: [number, number, number, number]): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
}

export function ScatterPlot({ data, width = 800, height = 600 }: ScatterPlotProps) {
  const { selectedIndices, toggleSelection, colorBy, showSelectedOnly } = useProjectStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select');
  const [viewState, setViewState] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<any>(null);

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
      maxZoom: 10,
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
    return data.coordinates
      .map((coord, idx) => ({
        position: coord as [number, number],
        id: data.episode_ids[idx],
        index: idx,
        selected: selectedIndices.has(idx),
      }))
      .filter((point) => !showSelectedOnly || point.selected);
  }, [data, selectedIndices, showSelectedOnly]);

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

    return [];
  }, [colorBy, metadata]);

  // Handle click
  const onClick = useCallback(
    (info: { object?: { index: number } }) => {
      if (info.object && interactionMode === 'select') {
        toggleSelection(info.object.index);
      }
    },
    [toggleSelection, interactionMode]
  );

  // Create layer
  const layers = useMemo(() => {
    return [
      new ScatterplotLayer({
        id: 'episodes',
        data: points,
        getPosition: (d: { position: [number, number] }) => d.position,
        getFillColor: (d: { index: number; selected: boolean }) =>
          getColor(d.index, data.metadata, colorBy, d.selected),
        getRadius: (d: { selected: boolean }) => (d.selected ? 8 : 5),
        radiusUnits: 'pixels',
        pickable: interactionMode === 'select',
        autoHighlight: interactionMode === 'select',
        highlightColor: [255, 255, 255, 100],
        onClick,
        updateTriggers: {
          getFillColor: [colorBy, selectedIndices],
          getRadius: [selectedIndices],
        },
      }),
    ];
  }, [points, data.metadata, colorBy, selectedIndices, onClick, interactionMode]);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
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
  }, [toggleFullscreen, handleZoomIn, handleZoomOut, handleResetView, isFullscreen]);

  const currentWidth = isFullscreen ? '100vw' : width;
  const currentHeight = isFullscreen ? '100vh' : height;

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

      {/* Toolbar */}
      <div className="absolute top-4 right-4 flex flex-col gap-1 bg-black/70 rounded-lg p-1 z-10">
        {/* Interaction mode toggle */}
        <button
          onClick={() => setInteractionMode(interactionMode === 'select' ? 'pan' : 'select')}
          className={`p-2 rounded transition-colors ${
            interactionMode === 'select' ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-white/10'
          }`}
          title={interactionMode === 'select' ? 'Select mode (click to pan)' : 'Pan mode (click to select)'}
        >
          {interactionMode === 'select' ? (
            <MousePointer2 className="w-4 h-4" />
          ) : (
            <Hand className="w-4 h-4" />
          )}
        </button>

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
          {showSelectedOnly
            ? `Showing ${points.length.toLocaleString()} of ${data.n_episodes.toLocaleString()}`
            : `${data.n_episodes.toLocaleString()} episodes`}
        </span>
        {selectedIndices.size > 0 && (
          <>
            <span className="text-gray-400">|</span>
            <span className="text-yellow-400">
              {selectedIndices.size.toLocaleString()} selected
            </span>
          </>
        )}
      </div>

      {/* Keyboard shortcuts hint (shown briefly on fullscreen) */}
      {isFullscreen && (
        <div className="absolute bottom-4 right-4 bg-black/70 text-gray-400 text-xs px-3 py-2 rounded">
          <span className="text-gray-500">Shortcuts:</span> F fullscreen • +/- zoom • R reset • Esc exit
        </div>
      )}
    </div>
  );
}
