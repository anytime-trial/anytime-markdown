import type { RenderGraph, ViewportState } from '../types';
import type { CooccurrenceTheme } from '../theme/readTheme';
import type { MinimapRect } from '../ui/minimapModel';
import { worldToScreen } from '../viewport/viewport';
import { buildNodeLookup, linkEndpoints } from './nodeLookup';

/** ミニマップ上で円が消えない最小半径（CSS ピクセル）。 */
const MIN_NODE_RADIUS = 1;
/** ミニマップの線の太さ。図の太さを縮尺すると 1px を割って消える。 */
const LINK_WIDTH = 0.5;
/** 「今見えている範囲」の枠線の太さ。共起の線（{@link LINK_WIDTH}）より太くして手前に見せる。 */
const FRAME_WIDTH = 1.5;

export interface DrawMinimapOptions {
  ctx: CanvasRenderingContext2D;
  /** CSS ピクセル単位の表示幅（バッキングストアの実ピクセル数ではない）。 */
  width: number;
  /** CSS ピクセル単位の表示高さ。 */
  height: number;
  graph: RenderGraph;
  /** ミニマップ自身の視野（`minimapViewport`）。 */
  viewport: ViewportState;
  /** 図で見えている範囲。null なら枠を描かない。 */
  frame: MinimapRect | null;
  theme: CooccurrenceTheme;
}

/**
 * 全体像と、図で見えている範囲の枠を描く。
 *
 * Why not `drawGraph` を縮尺して使い回すか: `drawGraph` はラベルの重なり判定（語数に対して
 * 二乗）とツールチップを含む。ミニマップは全体の形を見る面であり語を読む面ではないため
 * （仕様 §3.5）、その計算は結果に現れないまま視野を動かすたびに走ることになる。
 *
 * Why not `ctx.scale()` で世界座標のまま描くか: 線の太さと円の枠まで一緒に縮み、
 * 1px を割って消える。座標だけを変換し、太さは画面ピクセルで指定する。
 */
export function drawMinimap(opts: DrawMinimapOptions): void {
  const { ctx, width, height, graph, viewport, frame, theme } = opts;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const lookup = buildNodeLookup(graph.nodes);

  ctx.strokeStyle = theme.link;
  ctx.lineWidth = LINK_WIDTH;
  for (const link of graph.links) {
    const endpoints = linkEndpoints(lookup, link);
    if (endpoints === null) continue;
    const { source, target } = endpoints;
    const from = worldToScreen({ x: source.x, y: source.y }, viewport);
    const to = worldToScreen({ x: target.x, y: target.y }, viewport);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  for (const node of graph.nodes) {
    const center = worldToScreen({ x: node.x, y: node.y }, viewport);
    const radius = Math.max(MIN_NODE_RADIUS, node.radius * viewport.scale);
    ctx.fillStyle = node.fill;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (frame) {
    // 線だけでなく内側も薄く塗る。線 1 本では、全体像の円と線が密なところで枠がどこまでか
    // 追えなくなる（C4 のミニマップと同じ見せ方。trail-viewer `minimapCanvas.ts`）。
    // 塗りは下の全体像が透ける濃さに留める。塗り潰すと、見えている範囲の中身が読めなくなる。
    const x = frame.x + FRAME_WIDTH / 2;
    const y = frame.y + FRAME_WIDTH / 2;
    const width = Math.max(1, frame.width - FRAME_WIDTH);
    const height = Math.max(1, frame.height - FRAME_WIDTH);
    ctx.fillStyle = theme.viewportFill;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = theme.viewportFrame;
    ctx.lineWidth = FRAME_WIDTH;
    // 枠は canvas の外側へも伸びる（全体表示中は全体とほぼ一致し、縁が切れる）。
    // 線幅の半分だけ内側へ寄せて、縁の線が半分に切られないようにする。
    ctx.strokeRect(x, y, width, height);
  }
  ctx.restore();
}
