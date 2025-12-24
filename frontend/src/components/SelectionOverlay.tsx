// SVG overlay for drawing lasso and box selections

import { useState, useRef, useEffect } from 'react';

interface SelectionOverlayProps {
  mode: 'box' | 'lasso';
  width: number;
  height: number;
  onSelectionComplete: (region: BoxRegion | LassoRegion) => void;
  modifierKey?: 'shift' | 'alt' | null; // For add/remove from selection
}

export interface BoxRegion {
  type: 'box';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LassoRegion {
  type: 'lasso';
  points: [number, number][];
}

export function SelectionOverlay({
  mode,
  width,
  height,
  onSelectionComplete,
  modifierKey,
}: SelectionOverlayProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const [currentPoint, setCurrentPoint] = useState<[number, number] | null>(null);
  const [lassoPath, setLassoPath] = useState<[number, number][]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  // Reset on mode change
  useEffect(() => {
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
    setLassoPath([]);
  }, [mode]);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPoint([x, y]);
    setCurrentPoint([x, y]);

    if (mode === 'lasso') {
      setLassoPath([[x, y]]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !startPoint) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentPoint([x, y]);

    if (mode === 'lasso') {
      setLassoPath((prev) => [...prev, [x, y]]);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !startPoint || !currentPoint) {
      setIsDrawing(false);
      return;
    }

    // Complete the selection
    if (mode === 'box') {
      const region: BoxRegion = {
        type: 'box',
        x1: startPoint[0],
        y1: startPoint[1],
        x2: currentPoint[0],
        y2: currentPoint[1],
      };
      onSelectionComplete(region);
    } else if (mode === 'lasso' && lassoPath.length > 2) {
      const region: LassoRegion = {
        type: 'lasso',
        points: lassoPath,
      };
      onSelectionComplete(region);
    }

    // Reset state
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
    setLassoPath([]);
  };

  // Handle mouse leaving the SVG area
  const handleMouseLeave = () => {
    if (isDrawing) {
      handleMouseUp();
    }
  };

  // Render box selection
  const renderBox = () => {
    if (!isDrawing || !startPoint || !currentPoint) return null;

    const x = Math.min(startPoint[0], currentPoint[0]);
    const y = Math.min(startPoint[1], currentPoint[1]);
    const w = Math.abs(currentPoint[0] - startPoint[0]);
    const h = Math.abs(currentPoint[1] - startPoint[1]);

    return (
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="rgba(100, 149, 237, 0.2)"
        stroke="#6495ED"
        strokeWidth="2"
        strokeDasharray="5,5"
      />
    );
  };

  // Render lasso selection
  const renderLasso = () => {
    if (!isDrawing || lassoPath.length < 2) return null;

    const pathString = lassoPath
      .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`)
      .join(' ');

    return (
      <path
        d={pathString}
        fill="rgba(100, 149, 237, 0.2)"
        stroke="#6495ED"
        strokeWidth="2"
        strokeDasharray="5,5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        cursor: 'crosshair',
        pointerEvents: 'all',
        zIndex: 5,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {mode === 'box' && renderBox()}
      {mode === 'lasso' && renderLasso()}

      {/* Show modifier key hint */}
      {isDrawing && modifierKey && (
        <text
          x={10}
          y={30}
          fill="white"
          fontSize="14"
          fontWeight="bold"
          style={{ pointerEvents: 'none' }}
        >
          {modifierKey === 'shift' ? 'Adding to selection' : 'Removing from selection'}
        </text>
      )}
    </svg>
  );
}
