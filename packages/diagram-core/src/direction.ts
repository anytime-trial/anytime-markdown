/**
 * 図の向きに従う折れ線の幾何。家族の線と手で引いた線が**同じ規則**を読む。
 *
 * 規則（ユーザー指示）: 上位の要素は先頭の面（`LR` は右面・`TB` は下面）の中央から出し、下位の
 * 要素へは末尾の面（左面・上面）の中央から入れる。折れるのは**下位の要素の直前のすき間の中央**。
 *
 * 向きごとに 2 通り書かず、**進む軸（main）と交わる軸（cross）**で 1 通りだけ書いて最後に x・y へ
 * 写す。2 通り書くと、片方の向きだけで直した回り込みがもう片方に取り残される。
 */

import type { ConnectorEnd, ConnectorPointAt } from './connectors';
import { columnBoundaryX, rowBoundaryY } from './spacing';
import type { ChartNode } from './layout';
import type { DiagramDirection, DiagramSpacing } from './types';

type Point = { readonly x: number; readonly y: number };

/** 進む軸と交わる軸で表した点。 */
type Frame = { readonly main: number; readonly cross: number };

const isBox = (end: ConnectorEnd): end is ChartNode => (end as ChartNode).name !== undefined;

/** 向き 1 つぶんの座標の読み替え。箱の縁・すき間の中央もここから引く。 */
function axes(direction: DiagramDirection, spacing: DiagramSpacing) {
  const lr = direction === 'LR';
  const mainSize = lr ? spacing.nodeWidth : spacing.nodeHeight;
  const crossSize = lr ? spacing.nodeHeight : spacing.nodeWidth;
  return {
    toPoint: (frame: Frame): Point => (lr ? { x: frame.main, y: frame.cross } : { x: frame.cross, y: frame.main }),
    toFrame: (point: Point): Frame => (lr ? { main: point.x, cross: point.y } : { main: point.y, cross: point.x }),
    /** 先頭の面の中央（線が出る所）。 */
    exit: (node: ChartNode): Frame => (lr
      ? { main: node.x + mainSize, cross: node.y + crossSize / 2 }
      : { main: node.y + mainSize, cross: node.x + crossSize / 2 }),
    /** 末尾の面の中央（線が入る所）。 */
    entry: (node: ChartNode): Frame => (lr
      ? { main: node.x, cross: node.y + crossSize / 2 }
      : { main: node.y, cross: node.x + crossSize / 2 }),
    /**
     * 箱の直前のすき間の中央（進む軸の座標）。**升目の切れ目と同じ 1 つの式**を読む — 別に式を
     * 持つと、左端の列の手前（すき間が無く余白しか無い）で線だけが図の外の負の座標へ出る。
     */
    gapBefore: (node: ChartNode): number => (lr
      ? columnBoundaryX(spacing, node.column)
      : rowBoundaryY(spacing, node.row)),
    gapAfter: (node: ChartNode): number => (lr
      ? columnBoundaryX(spacing, node.column + 1)
      : rowBoundaryY(spacing, node.row + 1)),
    /** 交わる軸で、箱の手前（`toward` が箱より手前なら）か向こうのすき間の中央。 */
    crossGapToward: (node: ChartNode, toward: number): number => {
      const centre = lr ? node.y + crossSize / 2 : node.x + crossSize / 2;
      return lr
        ? rowBoundaryY(spacing, toward >= centre ? node.row + 1 : node.row)
        : columnBoundaryX(spacing, toward >= centre ? node.column + 1 : node.column);
    },
    /** 進む向き（ラジアン）。端の印は出る側がこの向き、入る側がその逆を持つ。 */
    forward: lr ? 0 : Math.PI / 2,
    backward: lr ? Math.PI : -Math.PI / 2,
  };
}

type Axes = ReturnType<typeof axes>;

/**
 * 上位の端から、折れる位置（進む軸の `bend`）までの経路。**終わりは `bend` の上**で、交わる軸の
 * どこで着いたかを最後の点が持つ。
 *
 * `bend` が出る点より手前（下位が同じ列・後ろの列に居る）なら、真っ直ぐ向かうと `owner` の箱を
 * 貫く。いったん `owner` の先頭のすき間へ出て、交わる軸のすき間を渡ってから戻る。出る点は箱の
 * 面とは限らない（家族の線は婚姻の線の結び目から出る）ので、箱と分けて受ける。
 */
function leadTo(
  frame: Axes,
  start: Frame,
  owner: ChartNode,
  bend: number,
  towardCross: number,
): readonly Frame[] {
  if (bend > start.main) return [start, { main: bend, cross: start.cross }];
  const out = frame.gapAfter(owner);
  const across = frame.crossGapToward(owner, towardCross);
  return [start, { main: out, cross: start.cross }, { main: out, cross: across }, { main: bend, cross: across }];
}

/**
 * 両親を結ぶ婚姻の線と、その結び目（子への線が出る所）。
 *
 * 両親とも先頭の面から出て、**先頭のすき間の手前半分**（面とすき間の中央の中ほど）で交わる軸に
 * 沿って結ぶ。すき間の中央は子への幹が通る所なので、そこで結ぶと実線の幹が破線の婚姻の線に
 * 重なって、婚姻が読めなくなる。両親の列が違えば、先の列の親のすき間に揃える（手前の親の線が
 * 先の親の箱を貫かない位置）。
 */
function marriageRoute(frame: Axes, first: ChartNode, second: ChartNode) {
  const [a, b] = [frame.exit(first), frame.exit(second)];
  const later = b.main > a.main ? second : first;
  const face = Math.max(a.main, b.main);
  const main = (face + frame.gapAfter(later)) / 2;
  return {
    path: polyline([a, { main, cross: a.cross }, { main, cross: b.cross }, b].map(frame.toPoint)),
    junction: { main, cross: (a.cross + b.cross) / 2 },
    owner: later,
  };
}

/** 点の並びを縦横の経路へ。長さ 0 の区間と、同じ向きに続く区間は 1 つへ畳む。 */
function polyline(points: readonly Point[]): string {
  const kept = simplify(points);
  const [head, ...rest] = kept;
  // 1 点しか残らない（長さ 0 の）区間は描かない。
  if (head === undefined || rest.length === 0) return '';
  let path = `M ${round(head.x)} ${round(head.y)}`;
  let previous = head;
  for (const point of rest) {
    if (point.y === previous.y) path += ` H ${round(point.x)}`;
    else if (point.x === previous.x) path += ` V ${round(point.y)}`;
    else path += ` L ${round(point.x)} ${round(point.y)}`;
    previous = point;
  }
  return path;
}

function simplify(points: readonly Point[]): Point[] {
  const distinct: Point[] = [];
  for (const point of points) {
    const last = distinct[distinct.length - 1];
    if (last === undefined || last.x !== point.x || last.y !== point.y) distinct.push(point);
  }
  const kept: Point[] = [];
  for (const point of distinct) {
    const a = kept[kept.length - 2];
    const b = kept[kept.length - 1];
    if (a !== undefined && b !== undefined
      && ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) {
      kept[kept.length - 1] = point;
    } else {
      kept.push(point);
    }
  }
  return kept;
}

/**
 * 手で引いた折れ線 1 本。`from` を上位、`to` を下位として扱う。**重なった 2 つは `null`**
 * （向きが決まらない線に印を付けると、どちらも向いていない矢尻が残る）。
 *
 * 端が点（別の線の中点に取り付いた端）のときは面が無いので、その点そのものが端になる。下位が
 * 点なら「直前のすき間」も無いので、両端の中ほどで折る。
 */
export function directedConnectorRoute(
  from: ConnectorEnd,
  to: ConnectorEnd,
  spacing: DiagramSpacing,
  direction: DiagramDirection,
): { readonly start: ConnectorPointAt; readonly end: ConnectorPointAt; readonly path: string } | null {
  const frame = axes(direction, spacing);
  const start = isBox(from) ? frame.exit(from) : frame.toFrame(from);
  const end = isBox(to) ? frame.entry(to) : frame.toFrame(to);
  if (isBox(from) && isBox(to) && from.x === to.x && from.y === to.y) return null;
  if (start.main === end.main && start.cross === end.cross) return null;
  const bend = isBox(to) ? frame.gapBefore(to) : (start.main + end.main) / 2;
  const lead = isBox(from)
    ? leadTo(frame, start, from, bend, end.cross)
    : [start, { main: bend, cross: start.cross }];
  const points = [...lead, { main: bend, cross: end.cross }, end].map(frame.toPoint);
  const [first, second] = simplify(points);
  const startAngle = first !== undefined && second !== undefined && !isBox(from)
    ? Math.atan2(second.y - first.y, second.x - first.x)
    : frame.forward;
  // 箱へは末尾の面から入る（最後の区間は必ず進む軸に沿う）。点で終わるときは最後の区間の向き。
  const endAngle = isBox(to) ? frame.backward : angleInto(points);
  return {
    start: { ...frame.toPoint(start), angle: startAngle },
    end: { ...frame.toPoint(end), angle: endAngle },
    path: polyline(points),
  };
}

/** 終端から線が伸びていく向き（最後の点から、その手前の点へ）。 */
function angleInto(points: readonly Point[]): number {
  const kept = simplify(points);
  const end = kept[kept.length - 1];
  const before = kept[kept.length - 2];
  if (end === undefined || before === undefined) return 0;
  return Math.atan2(before.y - end.y, before.x - end.x);
}

export interface DirectedFamilyRoute {
  /** 子への線が出る点。家族の線の取っ手・別の線の取り付き先になる。 */
  readonly junction: Point;
  /** 両親を結ぶ婚姻の線。片親の家族には無い。 */
  readonly marriage: string | null;
  /** 子への線（片親の家族では親から出る線を含む）。 */
  readonly path: string;
  /** 親ごとの出る点。 */
  readonly starts: readonly Point[];
  /** 子ごとの入る点と、そこから線が伸びていく向き。 */
  readonly ends: readonly ConnectorPointAt[];
  /** 結び目に置く始点の印の向き（進む向き）。 */
  readonly startAngle: number;
}

/**
 * 家族 1 件の折れ線。両親は婚姻の線で結び、**その結び目から子の直前のすき間へ**線を降ろす。
 * 片親なら親の先頭の面から直に降ろす。
 *
 * 婚姻の線を省いて両親の線を幹で合流させる形は採らない。合流の線は親子の線種で描かれるので、
 * 子の居る夫婦だけ婚姻（アクセントの破線）が図から読めなくなる。
 *
 * 子が複数の列に分かれていれば、列ごとに「その子の直前のすき間」で折る。いちばん手前の列で
 * 分かれ、そこから先の列へは結び目の高さで幹を伸ばす。
 */
export function directedFamilyRoute(
  parents: readonly ChartNode[],
  children: readonly ChartNode[],
  spacing: DiagramSpacing,
  direction: DiagramDirection,
): DirectedFamilyRoute {
  const frame = axes(direction, spacing);
  const entries = children.map((child) => ({ child, entry: frame.entry(child), bend: frame.gapBefore(child) }));
  const bends = [...new Set(entries.map((item) => item.bend))].sort((a, b) => a - b);
  const [first] = bends;
  // 子の居ない家族は合流先が無い。呼ぶ側（`familyConnector`）が婚姻の線へ振り分ける。
  if (first === undefined) throw new Error('directedFamilyRoute: 子の居ない家族には折れ線を組めません');
  const towardCross = entries.reduce((sum, item) => sum + item.entry.cross, 0) / entries.length;
  const [one, other, ...rest] = parents;
  const marriage = one !== undefined && other !== undefined ? marriageRoute(frame, one, other) : null;
  const fromFace = (parent: ChartNode) => leadTo(frame, frame.exit(parent), parent, first, towardCross);
  // 3 人目以降の親は婚姻の線に入れず、自分の面から幹へ合流させる（読み取りは親の人数に上限を
  // 置かないので、先頭 2 人だけで線を組むと残りの親の線が黙って消える）。
  const leads = marriage === null
    ? parents.map(fromFace)
    : [leadTo(frame, marriage.junction, marriage.owner, first, towardCross), ...rest.map(fromFace)];
  const joins = leads.map((lead) => lead[lead.length - 1]!.cross);
  const junctionCross = joins.reduce((sum, value) => sum + value, 0) / joins.length;

  const parts: string[] = leads.map((lead) => polyline(lead.map(frame.toPoint)));
  const segment = (a: Frame, b: Frame) => {
    parts.push(polyline([frame.toPoint(a), frame.toPoint(b)]));
  };
  for (const bend of bends) {
    const group = entries.filter((item) => item.bend === bend);
    const crosses = group.map((item) => item.entry.cross);
    const span = bend === first ? [...joins, ...crosses] : [junctionCross, ...crosses];
    if (bend !== first) segment({ main: first, cross: junctionCross }, { main: bend, cross: junctionCross });
    const low = Math.min(...span);
    const high = Math.max(...span);
    segment({ main: bend, cross: low }, { main: bend, cross: high });
    for (const item of group) segment({ main: bend, cross: item.entry.cross }, item.entry);
  }

  return {
    junction: frame.toPoint(marriage?.junction ?? { main: first, cross: junctionCross }),
    marriage: marriage?.path ?? null,
    path: parts.filter((part) => part !== '').join(' '),
    starts: parents.map((parent) => frame.toPoint(frame.exit(parent))),
    ends: entries.map((item) => ({ ...frame.toPoint(item.entry), angle: frame.backward })),
    startAngle: frame.forward,
  };
}

/** 小数は 2 桁で切る（`connectors.ts` と同じ。属性の文字列が 17 桁で書き換わるのを避ける）。 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
