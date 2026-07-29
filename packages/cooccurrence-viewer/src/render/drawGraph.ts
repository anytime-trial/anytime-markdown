import { LINK_DIRECTION } from '@anytime-markdown/graph-core';
import type { RenderGraph, RenderNode, ViewportState } from '../types';
import type { CooccurrenceTheme } from '../theme/readTheme';
import { arrowHeadPoints, type ArrowHead } from './arrow';
import { computeNeighborhoodHighlight } from './highlight';
import { selectVisibleLabels } from './labels';
import { worldToScreen } from '../viewport/viewport';

/**
 * 座標系の契約: `drawGraph` は CSS ピクセル座標で描き、基底の変換行列（devicePixelRatio）は
 * 呼び出し側が張ったものをそのまま使う。
 *
 * Why not 先頭で `setTransform(1,0,0,1,0,0)` して自前でリセットするか: 円と線は
 * `save/restore` の内側、ラベルとツールチップは外側で描くため、内側だけ単位行列へ落とすと
 * 円が DPR なし・ラベルが DPR ありの別座標系になり、DPR が 1 でない環境（VS Code の
 * ウィンドウズームで変化する）でラベルだけ dpr 倍の位置へ飛ぶ。クリア範囲も
 * バッキングストアの一部しか覆えず、外周に描いたラベルが消えずに残る。
 */
export interface DrawGraphOptions {
  ctx: CanvasRenderingContext2D;
  /** CSS ピクセル単位の表示幅（バッキングストアの実ピクセル数ではない）。 */
  width: number;
  /** CSS ピクセル単位の表示高さ。 */
  height: number;
  graph: RenderGraph;
  viewport: ViewportState;
  theme: CooccurrenceTheme;
  selectedNodeIndex: number | null;
  hoveredNode: RenderNode | null;
}

function fillArrowHead(ctx: CanvasRenderingContext2D, head: ArrowHead, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(head.tip.x, head.tip.y);
  ctx.lineTo(head.left.x, head.left.y);
  ctx.lineTo(head.right.x, head.right.y);
  ctx.closePath();
  ctx.fill();
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
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const highlight = computeNeighborhoodHighlight(graph, selectedNodeIndex);
  const nodeByIndex = new Map(graph.nodes.map((node) => [node.index, node]));

  ctx.save();
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

    // 矢頭は線と同じ globalAlpha のまま描く。線だけが淡くなり矢頭が残ると、隠したはずの共起が
    // 目立つ（設計書 §3.1）。
    if (link.direction === LINK_DIRECTION.forward || link.direction === LINK_DIRECTION.both) {
      fillArrowHead(ctx, arrowHeadPoints(source, target, target.radius, link.width), theme.link);
    }
    if (link.direction === LINK_DIRECTION.backward || link.direction === LINK_DIRECTION.both) {
      fillArrowHead(ctx, arrowHeadPoints(target, source, source.radius, link.width), theme.link);
    }
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
  ctx.restore();
}

function drawTooltip(
  ctx: CanvasRenderingContext2D,
  node: RenderNode,
  viewport: ViewportState,
  theme: CooccurrenceTheme,
  width: number,
  height: number,
): void {
  const anchor = worldToScreen({ x: node.x, y: node.y }, viewport);
  const x = anchor.x + 14;
  const y = anchor.y + 14;
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
