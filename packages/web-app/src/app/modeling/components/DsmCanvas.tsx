'use client';

import type { BoundaryInfo, C4Model, DsmMatrix } from '@anytime-markdown/c4-kernel';
import { buildC4Matrix, clusterMatrix, detectCycles } from '@anytime-markdown/c4-kernel';
import { useCallback, useEffect, useRef, useState } from 'react';

interface DsmCanvasProps {
  readonly model: C4Model;
  readonly boundaries: readonly BoundaryInfo[];
  readonly level: 'component' | 'package';
  readonly clustered: boolean;
}

// --- Constants ---

const CELL_SIZE = 32;
const HEADER_WIDTH = 120;
const HEADER_HEIGHT = 120;

const ACCENT_BLUE = '#90CAF9';
const DIAGONAL_COLOR = '#333333';
const GRID_COLOR = '#3c3c3c';
const TEXT_COLOR = '#cccccc';
const HOVER_COLOR = 'rgba(255,255,255,0.08)';
const CYCLE_BORDER_COLOR = '#F44336';
const DEPENDENCY_COLOR = ACCENT_BLUE;

// --- Helpers ---

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text;
}

function hitTestCell(
  mouseX: number,
  mouseY: number,
  viewport: { offsetX: number; offsetY: number; scale: number },
  nodeCount: number,
): { row: number; col: number } | null {
  const worldX = (mouseX - viewport.offsetX) / viewport.scale;
  const worldY = (mouseY - viewport.offsetY) / viewport.scale;
  const col = Math.floor((worldX - HEADER_WIDTH) / CELL_SIZE);
  const row = Math.floor((worldY - HEADER_HEIGHT) / CELL_SIZE);
  if (row < 0 || row >= nodeCount || col < 0 || col >= nodeCount) return null;
  return { row, col };
}

// --- Component ---

export function DsmCanvas({ model, boundaries, level, clustered }: Readonly<DsmCanvasProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const viewportRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });
  const hoveredCellRef = useRef<{ row: number; col: number } | null>(null);
  const matrixRef = useRef<DsmMatrix | null>(null);
  const cyclicSetRef = useRef(new Set<string>());
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  // Build matrix when inputs change
  useEffect(() => {
    let matrix = buildC4Matrix(model, level, boundaries);
    if (clustered) {
      matrix = clusterMatrix(matrix);
    }
    matrixRef.current = matrix;

    // Detect cycles
    const sccs = detectCycles(matrix.adjacency, matrix.nodes.map(n => n.id));
    const set = new Set<string>();
    for (const scc of sccs) {
      for (let i = 0; i < scc.length; i++) {
        for (let j = i + 1; j < scc.length; j++) {
          set.add(`${scc[i]}:${scc[j]}`);
          set.add(`${scc[j]}:${scc[i]}`);
        }
      }
    }
    cyclicSetRef.current = set;

    // Reset viewport
    viewportRef.current = { offsetX: 0, offsetY: 0, scale: 1 };
    hoveredCellRef.current = null;
    setTooltip(null);
  }, [model, boundaries, level, clustered]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      const cvs = canvas!;
      const matrix = matrixRef.current;
      if (!matrix) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const w = cvs.clientWidth;
      const h = cvs.clientHeight;
      const dpr = globalThis.devicePixelRatio ?? 1;
      cvs.width = w * dpr;
      cvs.height = h * dpr;

      const vp = viewportRef.current;
      const hovered = hoveredCellRef.current;
      const n = matrix.nodes.length;
      const cyclicSet = cyclicSetRef.current;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      if (n === 0) {
        ctx!.fillStyle = TEXT_COLOR;
        ctx!.font = '14px sans-serif';
        ctx!.fillText('No data. Import a C4 model first.', 20, 40);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx!.save();
      ctx!.translate(vp.offsetX, vp.offsetY);
      ctx!.scale(vp.scale, vp.scale);

      // Grid lines
      ctx!.strokeStyle = GRID_COLOR;
      ctx!.lineWidth = 0.5;
      for (let i = 0; i <= n; i++) {
        const x = HEADER_WIDTH + i * CELL_SIZE;
        const y = HEADER_HEIGHT + i * CELL_SIZE;
        ctx!.beginPath();
        ctx!.moveTo(x, HEADER_HEIGHT);
        ctx!.lineTo(x, HEADER_HEIGHT + n * CELL_SIZE);
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.moveTo(HEADER_WIDTH, y);
        ctx!.lineTo(HEADER_WIDTH + n * CELL_SIZE, y);
        ctx!.stroke();
      }

      // Cells
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const x = HEADER_WIDTH + j * CELL_SIZE;
          const y = HEADER_HEIGHT + i * CELL_SIZE;

          if (i === j) {
            ctx!.fillStyle = DIAGONAL_COLOR;
            ctx!.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            continue;
          }

          if (matrix.adjacency[i][j] === 1) {
            ctx!.fillStyle = DEPENDENCY_COLOR;
            ctx!.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          }

          // Cyclic border
          const key = `${matrix.nodes[i].id}:${matrix.nodes[j].id}`;
          if (cyclicSet.has(key) && matrix.adjacency[i][j] === 1) {
            ctx!.strokeStyle = CYCLE_BORDER_COLOR;
            ctx!.lineWidth = 2;
            ctx!.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            ctx!.lineWidth = 0.5;
          }
        }
      }

      // Hover highlight
      if (hovered) {
        ctx!.fillStyle = HOVER_COLOR;
        ctx!.fillRect(HEADER_WIDTH, HEADER_HEIGHT + hovered.row * CELL_SIZE, n * CELL_SIZE, CELL_SIZE);
        ctx!.fillRect(HEADER_WIDTH + hovered.col * CELL_SIZE, HEADER_HEIGHT, CELL_SIZE, n * CELL_SIZE);
      }

      // Headers
      ctx!.fillStyle = TEXT_COLOR;
      ctx!.font = '10px sans-serif';
      ctx!.textBaseline = 'middle';

      for (let i = 0; i < n; i++) {
        const name = truncate(matrix.nodes[i].name, 14);

        // Row header (left)
        ctx!.textAlign = 'right';
        ctx!.fillText(name, HEADER_WIDTH - 4, HEADER_HEIGHT + i * CELL_SIZE + CELL_SIZE / 2);

        // Column header (top, rotated)
        ctx!.save();
        ctx!.translate(HEADER_WIDTH + i * CELL_SIZE + CELL_SIZE / 2, HEADER_HEIGHT - 4);
        ctx!.rotate(-Math.PI / 4);
        ctx!.textAlign = 'left';
        ctx!.fillText(name, 0, 0);
        ctx!.restore();
      }

      ctx!.restore();
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [model, boundaries, level, clustered]);

  // Mouse move (hover + pan)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      const dx = e.clientX - lastPanRef.current.x;
      const dy = e.clientY - lastPanRef.current.y;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      viewportRef.current = {
        ...viewportRef.current,
        offsetX: viewportRef.current.offsetX + dx,
        offsetY: viewportRef.current.offsetY + dy,
      };
      return;
    }

    const matrix = matrixRef.current;
    if (!matrix) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cell = hitTestCell(mx, my, viewportRef.current, matrix.nodes.length);
    hoveredCellRef.current = cell;

    if (cell) {
      const rowName = matrix.nodes[cell.row].name;
      const colName = matrix.nodes[cell.col].name;
      setTooltip({ text: `${rowName} → ${colName}`, x: e.clientX, y: e.clientY });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // Zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const vp = viewportRef.current;
      viewportRef.current = {
        scale: vp.scale * factor,
        offsetX: mx - (mx - vp.offsetX) * factor,
        offsetY: my - (my - vp.offsetY) * factor,
      };
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            background: '#252526',
            color: '#cccccc',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 11,
            pointerEvents: 'none',
            zIndex: 100,
            border: '1px solid #555',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
