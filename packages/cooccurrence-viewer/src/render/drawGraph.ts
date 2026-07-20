import type { RenderGraph, RenderNode, ViewportState } from '../types';
import type { CooccurrenceTheme } from '../theme/readTheme';
import { computeNeighborhoodHighlight } from './highlight';
import { selectVisibleLabels } from './labels';

export interface DrawGraphOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  graph: RenderGraph;
  viewport: ViewportState;
  theme: CooccurrenceTheme;
  selectedNodeIndex: number | null;
  hoveredNode: RenderNode | null;
}

function visibleAlpha(
  selectedNodeIndex: number | null,
  highlightedNodes: ReadonlySet<number> | undefined,
  index: number,
): number {
  if (selectedNodeIndex === null || !highlightedNodes) return 1;
  return highlightedNodes.has(index) ? 1 : 0.18;
}

export function drawGraph(opts: DrawGraphOptions): void {
  const { ctx, width, height, graph, viewport, theme, selectedNodeIndex, hoveredNode } = opts;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const highlight = computeNeighborhoodHighlight(graph, selectedNodeIndex);
  const nodeByIndex = new Map(graph.nodes.map((node) => [node.index, node]));
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  for (const link of graph.links) {
    const source = nodeByIndex.get(link.source);
    const target = nodeByIndex.get(link.target);
    if (!source || !target) continue;
    const selectedAlpha = selectedNodeIndex === null || highlight?.linkIndexes.has(link.index) ? 1 : 0.14;
    ctx.globalAlpha = selectedAlpha;
    ctx.strokeStyle = theme.link;
    ctx.lineWidth = link.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
  }

  for (const node of graph.nodes) {
    ctx.globalAlpha = visibleAlpha(selectedNodeIndex, highlight?.nodeIndexes, node.index);
    ctx.fillStyle = node.fill;
    ctx.strokeStyle = node.stroke;
    ctx.lineWidth = node.strokeWidth;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  const labels = selectVisibleLabels(
    graph.nodes,
    viewport,
    (text, fontSize) => {
      ctx.font = `${fontSize}px sans-serif`;
      return ctx.measureText(text).width;
    },
  );
  for (const label of labels) {
    const alpha = visibleAlpha(selectedNodeIndex, highlight?.nodeIndexes, label.nodeIndex);
    if (alpha < 0.5) continue;
    ctx.font = `${label.fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.text;
    ctx.globalAlpha = alpha;
    ctx.fillText(label.text, label.x + label.width / 2, label.y + label.height / 2);
  }
  ctx.globalAlpha = 1;

  if (hoveredNode) drawTooltip(ctx, hoveredNode, viewport, theme, width, height);
}

function drawTooltip(
  ctx: CanvasRenderingContext2D,
  node: RenderNode,
  viewport: ViewportState,
  theme: CooccurrenceTheme,
  width: number,
  height: number,
): void {
  const x = node.x * viewport.scale + viewport.offsetX + 14;
  const y = node.y * viewport.scale + viewport.offsetY + 14;
  const lines = [node.label, `frequency: ${node.frequency}`, `cooccurrences: ${node.cooccurrenceCount}`];
  ctx.font = '12px sans-serif';
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const boxWidth = textWidth + 16;
  const boxHeight = lines.length * 18 + 12;
  const left = Math.min(Math.max(8, x), Math.max(8, width - boxWidth - 8));
  const top = Math.min(Math.max(8, y), Math.max(8, height - boxHeight - 8));

  ctx.fillStyle = theme.surface;
  ctx.strokeStyle = theme.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(left, top, boxWidth, boxHeight, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, index) => ctx.fillText(line, left + 8, top + 8 + index * 18));
}
