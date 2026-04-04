export type Side = 'top' | 'right' | 'bottom' | 'left';

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

import { OVERLAP_OFFSET } from './constants';

/** 障害物なしの直交パス */
function computeDirectPath(
  fromPt: Point,
  fromSide: Side,
  toPt: Point,
  toSide: Side,
): Point[] {
  // 始点と終点が重なっている場合、接続辺の方向にオフセットして迂回パスを生成
  if (fromPt.x === toPt.x && fromPt.y === toPt.y) {
    return computeOverlapPath(fromPt, fromSide, toPt, toSide);
  }

  const isHorizontalStart = fromSide === 'left' || fromSide === 'right';
  const isHorizontalEnd = toSide === 'left' || toSide === 'right';

  if (isHorizontalStart && isHorizontalEnd) {
    const midX = (fromPt.x + toPt.x) / 2;
    return [fromPt, { x: midX, y: fromPt.y }, { x: midX, y: toPt.y }, toPt];
  } else if (!isHorizontalStart && !isHorizontalEnd) {
    const midY = (fromPt.y + toPt.y) / 2;
    return [fromPt, { x: fromPt.x, y: midY }, { x: toPt.x, y: midY }, toPt];
  } else if (isHorizontalStart) {
    return [fromPt, { x: toPt.x, y: fromPt.y }, toPt];
  } else {
    return [fromPt, { x: fromPt.x, y: toPt.y }, toPt];
  }
}

/** 始点と終点が重なる場合の迂回パス */
function computeOverlapPath(
  fromPt: Point,
  fromSide: Side,
  toPt: Point,
  toSide: Side,
): Point[] {
  const d = OVERLAP_OFFSET;
  const fx = fromPt.x;
  const fy = fromPt.y;

  // fromSide の方向にオフセットした中間点を経由して toSide の方向へ戻る
  const fromOffset = sideOffset(fromSide, d);
  const toOffset = sideOffset(toSide, d);

  const p1 = { x: fx + fromOffset.dx, y: fy + fromOffset.dy };
  const p4 = { x: fx + toOffset.dx, y: fy + toOffset.dy };

  // p1 と p4 を直交で接続
  const isFromH = fromSide === 'left' || fromSide === 'right';
  const isToH = toSide === 'left' || toSide === 'right';

  if (isFromH && isToH) {
    // 両方水平: p1→corner→p4
    const cornerY = Math.min(p1.y, p4.y) - d;
    return [fromPt, p1, { x: p1.x, y: cornerY }, { x: p4.x, y: cornerY }, p4, toPt];
  } else if (!isFromH && !isToH) {
    // 両方垂直: p1→corner→p4
    const cornerX = Math.min(p1.x, p4.x) - d;
    return [fromPt, p1, { x: cornerX, y: p1.y }, { x: cornerX, y: p4.y }, p4, toPt];
  } else {
    // 水平+垂直: L字で接続
    return [fromPt, p1, { x: p1.x, y: p4.y }, p4, toPt];
  }
}

function sideOffset(side: Side, d: number): { dx: number; dy: number } {
  switch (side) {
    case 'right': return { dx: d, dy: 0 };
    case 'left': return { dx: -d, dy: 0 };
    case 'bottom': return { dx: 0, dy: d };
    case 'top': return { dx: 0, dy: -d };
  }
}

/**
 * Visibility Graph ベースの直交ルーティング。
 * 4フェーズ（マージン矩形構築、可視グラフ生成、Dijkstra探索、後処理）を統合する。
 */
export function computeVisibilityPath(
  fromPt: Point,
  fromSide: Side,
  toPt: Point,
  toSide: Side,
  _obstacles: readonly Rect[] = [],
): Point[] {
  return computeDirectPath(fromPt, fromSide, toPt, toSide);
}
