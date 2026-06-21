/**
 * FlowchartCanvas vanilla factory.
 *
 * Ports FlowchartCanvas.tsx (memo component) to a vanilla DOM factory.
 * Single-shot draw (no rAF loop): redraws on mount and on each update call.
 */

import type { FlowGraph, FlowNode } from '@anytime-markdown/trail-core/analyzer';
import { getC4Colors } from '../../../theme/c4Tokens';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FlowchartCanvasProps {
  readonly graph: FlowGraph;
  readonly isDark?: boolean;
  readonly errorMessage?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_W = 140;
const NODE_H = 36;
const H_GAP = 60;
const V_GAP = 50;

// ---------------------------------------------------------------------------
// Pure helpers (verbatim from React source)
// ---------------------------------------------------------------------------

interface Pos { x: number; y: number }

function layoutNodes(graph: FlowGraph): Map<string, Pos> {
  const pos = new Map<string, Pos>();
  if (graph.nodes.length === 0) return pos;

  const inDeg = new Map<string, number>();
  for (const n of graph.nodes) inDeg.set(n.id, 0);
  for (const e of graph.edges) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);

  const depth = new Map<string, number>();
  for (const n of graph.nodes) depth.set(n.id, 0);

  const remaining = new Map(inDeg);
  const topoQueue: string[] = [];
  for (const [id, d] of remaining) {
    if (d === 0) topoQueue.push(id);
  }

  while (topoQueue.length > 0) {
    const cur = topoQueue.shift()!;
    const curD = depth.get(cur) ?? 0;
    for (const e of graph.edges) {
      if (e.from !== cur) continue;
      const newD = curD + 1;
      if (newD > (depth.get(e.to) ?? 0)) depth.set(e.to, newD);
      const deg = (remaining.get(e.to) ?? 1) - 1;
      remaining.set(e.to, deg);
      if (deg === 0) topoQueue.push(e.to);
    }
  }

  const maxD = Math.max(0, ...[...depth.values()]);
  for (const n of graph.nodes) {
    if (!depth.has(n.id)) depth.set(n.id, maxD + 1);
  }

  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depth) {
    const arr = byDepth.get(d) ?? [];
    arr.push(id);
    byDepth.set(d, arr);
  }

  const xPos = new Map<string, number>();
  const maxDepthVal = Math.max(0, ...[...depth.values()]);

  for (let d = 0; d <= maxDepthVal; d++) {
    const ids = byDepth.get(d) ?? [];
    if (ids.length === 0) continue;

    if (d === 0) {
      ids.forEach((id, i) => {
        xPos.set(id, (NODE_W + H_GAP) * (i - (ids.length - 1) / 2));
      });
    } else {
      const withBC = ids.map((id) => {
        const parentXs = graph.edges
          .filter((e) => e.to === id)
          .map((e) => xPos.get(e.from) ?? 0);
        const bc = parentXs.length > 0
          ? parentXs.reduce((s, x) => s + x, 0) / parentXs.length
          : 0;
        return { id, bc };
      });
      withBC.sort((a, b) => a.bc - b.bc);
      withBC.forEach(({ id }, i) => {
        xPos.set(id, (NODE_W + H_GAP) * (i - (withBC.length - 1) / 2));
      });
    }
  }

  for (const [id, d] of depth) {
    pos.set(id, { x: xPos.get(id) ?? 0, y: d * (NODE_H + V_GAP) });
  }

  return pos;
}

function getNodeColor(kind: FlowNode['kind'], isDark: boolean): string {
  const colors = getC4Colors(isDark);
  const palette: Record<FlowNode['kind'], string> = {
    start:    colors.flowchartStart,
    end:      colors.flowchartEnd,
    process:  colors.flowchartProcess,
    decision: colors.flowchartDecision,
    loop:     colors.flowchartLoop,
    call:     colors.flowchartCall,
    return:   colors.flowchartReturn,
    error:    colors.flowchartError,
  };
  return palette[kind];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function mountFlowchartCanvas(
  container: HTMLElement,
  initialProps: FlowchartCanvasProps,
): VanillaViewHandle<FlowchartCanvasProps> {
  let props = initialProps;
  let destroyed = false;

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;';

  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'flowchart');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  wrapper.appendChild(canvas);

  container.appendChild(wrapper);

  // ---------------------------------------------------------------------------
  // Draw (single-shot, called on mount and update)
  // ---------------------------------------------------------------------------

  function draw(): void {
    if (destroyed) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isDark = props.isDark ?? true;
    const colors = getC4Colors(isDark);
    const { graph, errorMessage } = props;

    const dpr = (typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio : null) ?? 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (errorMessage) {
      ctx.fillStyle = colors.text;
      ctx.font = '14px sans-serif';
      ctx.fillText(errorMessage, 20, 40);
      return;
    }
    if (graph.nodes.length === 0) {
      ctx.fillStyle = colors.textMuted;
      ctx.font = '13px sans-serif';
      ctx.fillText('No flow data.', 20, 40);
      return;
    }

    const posMap = layoutNodes(graph);
    const cx = w / 2;
    const cy = 40;

    // Edges
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1.5;
    for (const edge of graph.edges) {
      const from = posMap.get(edge.from);
      const to = posMap.get(edge.to);
      if (!from || !to) continue;
      const fx = cx + from.x + NODE_W / 2;
      const fy = cy + from.y + NODE_H;
      const tx = cx + to.x + NODE_W / 2;
      const ty = cy + to.y;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.bezierCurveTo(fx, fy + 20, tx, ty - 20, tx, ty);
      ctx.stroke();
      if (edge.label) {
        ctx.fillStyle = colors.textSecondary;
        ctx.font = '10px sans-serif';
        ctx.fillText(edge.label, (fx + tx) / 2 + 4, (fy + ty) / 2);
      }
    }

    // Nodes
    for (const node of graph.nodes) {
      const p = posMap.get(node.id);
      if (!p) continue;
      const x = cx + p.x;
      const y = cy + p.y;
      const fill = getNodeColor(node.kind, isDark);

      ctx.fillStyle = fill;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;

      if (node.kind === 'decision') {
        const mx = x + NODE_W / 2;
        const my = y + NODE_H / 2;
        ctx.beginPath();
        ctx.moveTo(mx, y);
        ctx.lineTo(x + NODE_W, my);
        ctx.lineTo(mx, y + NODE_H);
        ctx.lineTo(x, my);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (node.kind === 'start' || node.kind === 'end') {
        ctx.beginPath();
        ctx.ellipse(x + NODE_W / 2, y + NODE_H / 2, NODE_W / 2, NODE_H / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const r = 6;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + NODE_W - r, y);
        ctx.arcTo(x + NODE_W, y, x + NODE_W, y + r, r);
        ctx.lineTo(x + NODE_W, y + NODE_H - r);
        ctx.arcTo(x + NODE_W, y + NODE_H, x + NODE_W - r, y + NODE_H, r);
        ctx.lineTo(x + r, y + NODE_H);
        ctx.arcTo(x, y + NODE_H, x, y + NODE_H - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const truncated = node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label;
      ctx.fillText(truncated, x + NODE_W / 2, y + NODE_H / 2);
      ctx.textAlign = 'left';
    }
  }

  // Initial draw
  draw();

  // ---------------------------------------------------------------------------
  // Handle
  // ---------------------------------------------------------------------------

  function update(newProps: FlowchartCanvasProps): void {
    props = newProps;
    draw();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    wrapper.remove();
  }

  return { update, destroy };
}
