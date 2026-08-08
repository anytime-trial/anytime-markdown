import { LINK_DIRECTION } from '@anytime-markdown/graph-core';
import type { RenderCardView, RenderGraph, RenderLink, RenderNode, ViewportState } from '../types';
import type { CooccurrenceTheme } from '../theme/readTheme';
import { arrowHeadPoints, type ArrowHead } from './arrow';
import { cardLinkAnchors, type CardLinkAnchor } from './cardLayout';
import { computeNeighborhoodHighlight, isNodeLit, timeLinkLit, type HighlightSelection } from './highlight';
import { selectVisibleLabels } from './labels';
import { buildNodeLookup, linkEndpoints, type NodeLookup } from './nodeLookup';
import { worldToScreen } from '../viewport/viewport';

/** レイヤー間の点線の見え方（設計書 §3.6.3）。矢印は持たず、共起の線より低いコントラストで描く。 */
const TIME_LINK_DASH = [4, 4];
const TIME_LINK_WIDTH = 1;
const TIME_LINK_ALPHA = 0.45;

/** レイヤー名の文字の大きさ（画面ピクセル）。視野の縮尺に依らず読める大きさで固定する。 */
const LAYER_LABEL_FONT_SIZE = 13;
/** レイヤー名を、レイヤーの矩形の上端からどれだけ離すか（画面ピクセル）。 */
const LAYER_LABEL_MARGIN = 6;

/** クラスタレーン名を、レーンの矩形の始端からどれだけ外へ離すか（画面ピクセル）。 */
const CLUSTER_LANE_LABEL_MARGIN = 10;
/** サブレーン名の文字の大きさ（画面ピクセル）。クラスタ名より一段小さくする（要件書「サブクラスタ」§2.4）。 */
const CLUSTER_SUB_LANE_LABEL_FONT_SIZE = 11;
/** サブレーン名をクラスタ名より内側へ字下げする量（画面ピクセル）。 */
const CLUSTER_SUB_LANE_LABEL_INDENT = 12;

/**
 * 座標系の契約: `drawGraph` は CSS ピクセル座標で描き、基底の変換行列（devicePixelRatio）は
 * 呼び出し側が張ったものをそのまま使う。
 *
 * Why not 先頭で `setTransform(1,0,0,1,0,0)` して自前でリセットするか: 円と線は
 * `save/restore` の内側、ラベルは外側で描くため、内側だけ単位行列へ落とすと
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
}

/**
 * メモの印の大きさ（世界座標）。円の半径に比例させつつ上下限で頭打ちにする。
 *
 * 比例だけにすると、頻度の低い語（小さい円）の印が読めない大きさへ潰れ、頻度の高い語では
 * 円と見分けがつかなくなる。矢印の大きさと同じ扱いである（設計書 §3.1）。
 */
const NOTE_MARK_MIN_RADIUS = 2.5;
const NOTE_MARK_MAX_RADIUS = 5;

function noteMarkRadius(nodeRadius: number): number {
  return Math.min(NOTE_MARK_MAX_RADIUS, Math.max(NOTE_MARK_MIN_RADIUS, nodeRadius * 0.22));
}

/**
 * メモを持つ印を描く。
 *
 * 色ではなく図形で示す（設計書 §3.1）。色はクラスタの符号として既に使われており、印に色を
 * 与えると、メモを持つ語が別クラスタに属するように見える。
 */
function drawNoteMark(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function linkMidpoint(source: RenderNode, target: RenderNode): { x: number; y: number } {
  return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
}

function shouldMarkLink(link: RenderLink): boolean {
  return link.hasNote;
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

/** 選択中に近傍外の線へ与える透明度。2D と OZ 3D（sceneModel）で同じ値を共有する。 */
export const LINK_DIM_ALPHA = 0.14;

export function visibleAlpha(
  highlight: HighlightSelection | null,
  index: number,
  layer: number,
): number {
  return isNodeLit(highlight, index, layer) ? 1 : 0.18;
}

/** カードの角丸半径（世界座標）。 */
const CARD_CORNER_RADIUS = 8;
/** カード内の左右の余白。 */
const CARD_PADDING_X = 10;
/** カード左端の色ドットの半径。 */
const CARD_DOT_RADIUS = 4;
const CARD_LABEL_FONT_SIZE = 12;
const CARD_FREQUENCY_FONT_SIZE = 11;
/** カラム見出しの文字の大きさ（画面ピクセル。レーン名と同じ扱い）。 */
const CARD_COLUMN_HEADER_FONT_SIZE = 13;
const CARD_SUB_HEADER_FONT_SIZE = 11;

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  // `ctx.roundRect` を使わないのは、テストの ctx モックと古い webview で存在が揃わないため。
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/** テキストを最大幅へ収まるまで末尾を落とす。二分探索で measureText の回数を抑える。 */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low === 0 ? '' : text.slice(0, low) + ellipsis;
}

/** ベジェの制御点の張り出し量。近いカードで巻き込み、遠いカードで間延びしないよう距離で決める。 */
function bezierReach(from: CardLinkAnchor, to: CardLinkAnchor): number {
  return Math.max(24, Math.min(120, Math.hypot(to.x - from.x, to.y - from.y) / 2));
}

function drawCardLinks(
  ctx: CanvasRenderingContext2D,
  graph: RenderGraph,
  cardView: RenderCardView,
  lookup: NodeLookup,
  highlight: HighlightSelection | null,
  theme: CooccurrenceTheme,
  selectedNodeIndex: number | null,
): void {
  const halfWidth = cardView.cardWidth / 2;
  const halfHeight = cardView.cardHeight / 2;
  for (const link of graph.links) {
    const endpoints = linkEndpoints(lookup, link);
    if (endpoints === null) continue;
    const { source, target } = endpoints;
    const { from, to } = cardLinkAnchors(source, target, halfWidth, halfHeight);
    const reach = bezierReach(from, to);
    const cp1 = { x: from.x + from.dx * reach, y: from.y + from.dy * reach };
    const cp2 = { x: to.x + to.dx * reach, y: to.y + to.dy * reach };

    ctx.globalAlpha = selectedNodeIndex === null || highlight?.linkIndexes.has(link.index) ? 1 : LINK_DIM_ALPHA;
    ctx.strokeStyle = theme.link;
    ctx.lineWidth = link.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y);
    ctx.stroke();

    // 矢頭は端点の接線（制御点 → 端点）に沿わせる。端点はすでにカードの辺の上にあるため
    // 半径ぶんの後退は不要（radius 0）。
    if (link.direction === LINK_DIRECTION.forward || link.direction === LINK_DIRECTION.both) {
      fillArrowHead(ctx, arrowHeadPoints(cp2, { x: to.x, y: to.y }, 0, link.width), theme.link);
    }
    if (link.direction === LINK_DIRECTION.backward || link.direction === LINK_DIRECTION.both) {
      fillArrowHead(ctx, arrowHeadPoints(cp1, { x: from.x, y: from.y }, 0, link.width), theme.link);
    }

    if (shouldMarkLink(link)) {
      // 三次ベジェの t=0.5 の点。線の中央に印を置く規則（円の図）と同じ場所に出す。
      const midX = (from.x + 3 * cp1.x + 3 * cp2.x + to.x) / 8;
      const midY = (from.y + 3 * cp1.y + 3 * cp2.y + to.y) / 8;
      drawNoteMark(ctx, midX, midY, NOTE_MARK_MIN_RADIUS, theme.text);
    }
  }
}

function drawCards(
  ctx: CanvasRenderingContext2D,
  graph: RenderGraph,
  cardView: RenderCardView,
  highlight: HighlightSelection | null,
  theme: CooccurrenceTheme,
): void {
  const halfWidth = cardView.cardWidth / 2;
  const halfHeight = cardView.cardHeight / 2;
  for (const node of graph.nodes) {
    ctx.globalAlpha = visibleAlpha(highlight, node.index, node.layer);
    const left = node.x - halfWidth;
    const top = node.y - halfHeight;

    // 下地は不透明にする。共起の線はカードの下に描かれており、透けるとカードの中の文字と混ざる。
    roundedRectPath(ctx, left, top, cardView.cardWidth, cardView.cardHeight, CARD_CORNER_RADIUS);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.fillStyle = node.fill;
    ctx.fill();
    ctx.strokeStyle = node.stroke;
    ctx.lineWidth = node.strokeWidth;
    ctx.stroke();

    // 左端の色ドット。カラム見出しから離れた場所でも所属クラスタを読めるようにする。
    ctx.fillStyle = node.stroke;
    ctx.beginPath();
    ctx.arc(left + CARD_PADDING_X + CARD_DOT_RADIUS, node.y, CARD_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // 頻度は右端へ数値で出す（カードは面積が一定のため。要件書 §2.2）。
    ctx.font = `${CARD_FREQUENCY_FONT_SIZE}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.textSecondary;
    const frequencyText = String(node.frequency);
    ctx.fillText(frequencyText, left + cardView.cardWidth - CARD_PADDING_X, node.y);
    const frequencyWidth = ctx.measureText(frequencyText).width;

    ctx.font = `${CARD_LABEL_FONT_SIZE}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.text;
    const labelLeft = left + CARD_PADDING_X + CARD_DOT_RADIUS * 2 + 6;
    const labelMax = left + cardView.cardWidth - CARD_PADDING_X - frequencyWidth - 6 - labelLeft;
    ctx.fillText(truncateToWidth(ctx, node.label, labelMax), labelLeft, node.y);

    if (node.hasNote) {
      drawNoteMark(ctx, left + cardView.cardWidth - CARD_PADDING_X, top + 8, NOTE_MARK_MIN_RADIUS + 1, theme.text);
    }
  }
}

/** カラム見出し。レイヤー名・レーン名と同じく画面ピクセルの大きさで描く（縮小時に最初に消えない）。 */
function drawCardColumnHeaders(
  ctx: CanvasRenderingContext2D,
  cardView: RenderCardView,
  viewport: ViewportState,
  theme: CooccurrenceTheme,
): void {
  for (const column of cardView.columns) {
    const anchor = worldToScreen({ x: column.x, y: column.y }, viewport);
    ctx.font = `${CARD_COLUMN_HEADER_FONT_SIZE}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = column.color;
    ctx.fillText(column.label, anchor.x, anchor.y);
    for (const sub of column.subHeaders) {
      const subAnchor = worldToScreen({ x: sub.x, y: sub.y }, viewport);
      ctx.font = `${CARD_SUB_HEADER_FONT_SIZE}px sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = theme.textSecondary;
      ctx.fillText(sub.label, subAnchor.x, subAnchor.y - 4);
    }
  }
}

export function drawGraph(opts: DrawGraphOptions): void {
  const { ctx, width, height, graph, viewport, theme, selectedNodeIndex } = opts;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const highlight = computeNeighborhoodHighlight(graph, selectedNodeIndex);
  const lookup = buildNodeLookup(graph.nodes);

  // カード表示（要件書「カード表示（card スキン）」§2.2・§2.3）。語のラベルはカードの中に
  // 描くため、円の図の重なり回避（selectVisibleLabels）は通らない。
  if (graph.cardView !== undefined) {
    ctx.save();
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);
    drawCardLinks(ctx, graph, graph.cardView, lookup, highlight, theme, selectedNodeIndex);
    drawCards(ctx, graph, graph.cardView, highlight, theme);
    ctx.restore();
    ctx.globalAlpha = 1;
    drawCardColumnHeaders(ctx, graph.cardView, viewport, theme);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  // レイヤー間の点線は最背面へ。同一性を示す線であり、語どうしの関係を示す共起の線と同じ強さで
  // 描くと 2 種類の線が混ざる（設計書 §3.6.3）。
  if (graph.timeLinks.length > 0) {
    ctx.save();
    ctx.setLineDash(TIME_LINK_DASH);
    ctx.strokeStyle = theme.link;
    ctx.lineWidth = TIME_LINK_WIDTH;
    for (const timeLink of graph.timeLinks) {
      ctx.globalAlpha = (timeLinkLit(highlight, timeLink) ? 1 : 0.18) * TIME_LINK_ALPHA;
      ctx.beginPath();
      ctx.moveTo(timeLink.x1, timeLink.y1);
      ctx.lineTo(timeLink.x2, timeLink.y2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  for (const link of graph.links) {
    const endpoints = linkEndpoints(lookup, link);
    if (endpoints === null) continue;
    const { source, target } = endpoints;
    const selectedAlpha = selectedNodeIndex === null || highlight?.linkIndexes.has(link.index) ? 1 : LINK_DIM_ALPHA;
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

    if (shouldMarkLink(link)) {
      const mid = linkMidpoint(source, target);
      drawNoteMark(ctx, mid.x, mid.y, NOTE_MARK_MIN_RADIUS, theme.text);
    }
  }

  for (const node of graph.nodes) {
    ctx.globalAlpha = visibleAlpha(highlight, node.index, node.layer);
    ctx.fillStyle = node.fill;
    ctx.strokeStyle = node.stroke;
    ctx.lineWidth = node.strokeWidth;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (node.hasNote) {
      // 円周の右上。中心へ置くとラベルと重なり、外へ離すと隣の円の印と紛れる。
      const offset = node.radius * Math.SQRT1_2;
      drawNoteMark(ctx, node.x + offset, node.y - offset, noteMarkRadius(node.radius), theme.text);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // レイヤー名は世界座標ではなく画面ピクセルで描く。世界座標で描くと、縮小したときに真っ先に
  // 読めなくなるのがレイヤー名になる（どのレイヤーを見ているかは、縮小しているときほど要る）。
  for (const layer of graph.layers) {
    const anchor = worldToScreen({ x: layer.labelX, y: layer.labelY }, viewport);
    ctx.font = `${LAYER_LABEL_FONT_SIZE}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = theme.text;
    const text = layer.at === undefined ? layer.label : `${layer.label}（${layer.at}）`;
    ctx.fillText(text, anchor.x, anchor.y - LAYER_LABEL_MARGIN);
  }

  // クラスタレーン名（要件書「クラスタレーン表示」§2.4）。レイヤー名と同じく画面ピクセルで描く。
  //
  // 描く側はレーンの軸で決める。縦レーンなら図の左外、横レーンなら図の上外へ置く。レイヤー名は
  // レイヤーの矩形の上端に付くため、軸が直交している限りこの 2 つは同じ場所を取り合わない。
  for (const lane of graph.clusterLanes) {
    const anchor = worldToScreen({ x: lane.labelX, y: lane.labelY }, viewport);
    const vertical = lane.axis === 'vertical';
    ctx.font = `${LAYER_LABEL_FONT_SIZE}px sans-serif`;
    ctx.fillStyle = lane.color;
    if (vertical) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(lane.label, anchor.x - CLUSTER_LANE_LABEL_MARGIN, anchor.y);
    } else {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(lane.label, anchor.x, anchor.y - CLUSTER_LANE_LABEL_MARGIN);
    }

    // サブレーン名（要件書「サブクラスタ」§2.4）。大きさ・色・字下げの 3 つでクラスタ名と
    // 差をつける。同じ見た目で描くと、名前が 2 段あることしか分からず階層が読めない。
    for (const sub of lane.subLanes) {
      if (sub.label === undefined) continue;
      const subAnchor = worldToScreen({ x: sub.labelX, y: sub.labelY }, viewport);
      ctx.font = `${CLUSTER_SUB_LANE_LABEL_FONT_SIZE}px sans-serif`;
      ctx.fillStyle = theme.textSecondary;
      if (vertical) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(sub.label, subAnchor.x - CLUSTER_LANE_LABEL_MARGIN - CLUSTER_SUB_LANE_LABEL_INDENT, subAnchor.y);
      } else {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(sub.label, subAnchor.x + CLUSTER_SUB_LANE_LABEL_INDENT, subAnchor.y - CLUSTER_LANE_LABEL_MARGIN);
      }
    }
  }

  const labels = selectVisibleLabels(
    graph.nodes,
    viewport,
    (text, fontSize) => {
      ctx.font = `${fontSize}px sans-serif`;
      return ctx.measureText(text).width;
    },
  );
  for (const label of labels) {
    const alpha = visibleAlpha(highlight, label.nodeIndex, label.layer);
    if (alpha < 0.5) continue;
    ctx.font = `${label.fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.text;
    ctx.globalAlpha = alpha;
    ctx.fillText(label.text, label.x + label.width / 2, label.y + label.height / 2);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}
