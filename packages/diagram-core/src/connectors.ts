/**
 * 手で引いた接続線の幾何。DOM を触らないので、node 環境の検査から直接測れる。
 *
 * 家族の線（`familyConnector`）と作りを分けてある。あちらは「両親を結び、その中点から子へ降ろす」
 * という**家族の形そのもの**を描く直交の折れ線で、世代（列）が揃っている前提に寄りかかっている。
 * 手で引く線は任意の升目どうしを結ぶので、同じ引き方をすると箱を貫く経路が出る。こちらは
 * **箱の縁どうしを直線で結ぶ**。
 */

import { assertNever } from './exhaustive';
import type { ChartNode } from './layout';
import type {
  DiagramAnchor,
  DiagramFamily,
  DiagramLineLook,
  DiagramLineRoute,
  DiagramSpacing,
} from './types';

/**
 * その家族の線の見た目。**上書きが無ければ種別から決まる既定**を返す。
 *
 * 既定をここに 1 つだけ置く。画面（設定の区画に出す今の値）と描画（実際に引く線）が別々に
 * 既定を持つと、上書きしていない線で「区画の表示と図が食い違う」状態ができる。
 *
 * 親子は実線、生成・誓約は破線。端の印は付けない — 家族の線は関係の向きを配置（左から右へ
 * 世代が進む）で示しており、既定で矢印を足すと図が一斉に賑やかになる。
 */
export function familyLook(family: DiagramFamily): DiagramLineLook {
  return family.look ?? {
    line: family.kind === 'birth' ? 'solid' : 'dashed',
    color: 'default',
    // 家族の線の既定は折れ線。親の横棒と子への縦棒という**家族の形そのもの**を描いており、
    // 直線に倒すと「誰と誰が親で、どこから子が降りているか」が読めなくなる。
    route: 'orthogonal',
    start: 'none',
    end: 'none',
  };
}

/** 手で引いた線の既定の見た目。**経路は直線**（これまでの描き方）。 */
export const DEFAULT_CONNECTOR_LOOK: DiagramLineLook = Object.freeze({
  line: 'solid', color: 'default', route: 'straight', start: 'none', end: 'none',
});

/** 端を辞書の鍵にできる形へ。**種別を混ぜない** — 同じ名前の要素と線を同じ鍵にしない。 */
export function anchorKey(anchor: DiagramAnchor): string {
  switch (anchor.kind) {
    case 'element': return 'e:' + anchor.name;
    case 'line': return 'l:' + anchor.line;
    case 'family': return 'f:' + [...anchor.parents].join('\u0000');
    default: return assertNever(anchor, 'anchorKey');
  }
}

/** 2 つの端が同じものを指すか。 */
export function sameAnchor(left: DiagramAnchor, right: DiagramAnchor): boolean {
  return anchorKey(left) === anchorKey(right);
}

/**
 * 1 つの図に持てる接続線の上限。
 *
 * 配置差分（`MAX_PLACEMENTS_PER_DIAGRAM`）と同じ桁に取る。線は要素数の 2 乗まで増えうるので、
 * 上限を置かないと、壊れたファイル 1 つで描画が要素数の 2 乗ぶんの経路計算へ膨らむ。
 */
export const MAX_CONNECTORS_PER_DIAGRAM = 1000;

export interface ConnectorPointAt {
  readonly x: number;
  readonly y: number;
  /** その端から線が伸びていく向き（ラジアン）。端の印の向きに使う。 */
  readonly angle: number;
}

export interface ConnectorGeometry {
  readonly start: ConnectorPointAt;
  readonly end: ConnectorPointAt;
  /** 線そのもの。端の印は別に描く（印の大きさを倍率から切り離すため）。 */
  readonly path: string;
}

/**
 * 線の端になれるもの。**箱（札）か、大きさを持たない点**（別の線の中点に取り付いた端）。
 *
 * 点を「幅 0・高さ 0 の箱」として渡させない。`borderPoint` は中心から縁までの倍率を出すので、
 * 0 の辺では倍率が無限大になり、縮退した箱だけ別の経路をたどる。種別で分けて、点はそのまま返す。
 */
export type ConnectorEnd = ChartNode | { readonly x: number; readonly y: number };

const isBox = (end: ConnectorEnd): end is ChartNode => (end as ChartNode).name !== undefined;

const centreOf = (end: ConnectorEnd, spacing: DiagramSpacing) => (isBox(end)
  ? { x: end.x + spacing.nodeWidth / 2, y: end.y + spacing.nodeHeight / 2 }
  : { x: end.x, y: end.y });

/**
 * 箱の中心から `towards` の向きへ進んで縁に当たる点。
 *
 * 辺を先に選ばず、縦横それぞれで縁までの倍率を出して**小さいほう**を採る。辺を角度で場合分け
 * すると、箱の縦横比を変えた（刻みは可変）とたんに角の付近で選ぶ辺が入れ替わり、線の取り付きが
 * 跳ぶ。
 */
export function borderPoint(
  node: ConnectorEnd,
  spacing: DiagramSpacing,
  towards: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  const centre = centreOf(node, spacing);
  // 点には縁が無い。その点そのものが端になる。
  if (!isBox(node)) return centre;
  const dx = towards.x - centre.x;
  const dy = towards.y - centre.y;
  if (dx === 0 && dy === 0) return centre;
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : spacing.nodeWidth / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : spacing.nodeHeight / 2 / Math.abs(dy),
  );
  return { x: centre.x + dx * scale, y: centre.y + dy * scale };
}

/**
 * 接続線 1 本の幾何。**箱が重なっている（中心が同じ）ときは `null`**。
 *
 * `null` を返すのは、向きが決まらない線に印を付けると角度が 0 に倒れ、どちらを向いているとも
 * 読めない矢尻が原点向きで残るため。描かないほうが「線がまだ引けていない」と分かる。
 */
export function connectorGeometry(
  from: ConnectorEnd,
  to: ConnectorEnd,
  spacing: DiagramSpacing,
  route: DiagramLineRoute = 'straight',
): ConnectorGeometry | null {
  const fromCentre = centreOf(from, spacing);
  const toCentre = centreOf(to, spacing);
  if (fromCentre.x === toCentre.x && fromCentre.y === toCentre.y) return null;
  const start = borderPoint(from, spacing, toCentre);
  const end = borderPoint(to, spacing, fromCentre);
  const angle = Math.atan2(toCentre.y - fromCentre.y, toCentre.x - fromCentre.x);
  return {
    start: { ...start, angle },
    // 終端から線が伸びていく向きは逆（矢尻は線の進む先を向く）。
    end: { ...end, angle: angle + Math.PI },
    path: routePath(start, end, route),
  };
}

/**
 * 2 点を結ぶ経路。**端の点は経路で動かさない。**
 *
 * 折れ線もカーブも、端そのものは直線のときと同じ場所に置く。経路ごとに取り付き位置を変えると、
 * 引き回しを選び直すたびに端の印（矢尻・丸）が札の周りを跳ぶ。
 */
export function routePath(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  route: DiagramLineRoute,
): string {
  const head = `M ${round(start.x)} ${round(start.y)}`;
  if (route === 'straight') return `${head} L ${round(end.x)} ${round(end.y)}`;
  // 長いほうの軸から曲げる。短いほうから曲げると、横に長い図で線が縦へ大きく張り出して
  // 間の札を横切る。
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  if (route === 'orthogonal') {
    const midX = round((start.x + end.x) / 2);
    const midY = round((start.y + end.y) / 2);
    return horizontal
      ? `${head} H ${midX} V ${round(end.y)} H ${round(end.x)}`
      : `${head} V ${midY} H ${round(end.x)} V ${round(end.y)}`;
  }
  // カーブは制御点を**長いほうの軸だけ**へ伸ばす。両軸へ伸ばすと S 字がねじれ、
  // 端の印の向き（直線の向きで決めている）と曲線の出だしが食い違う。
  const first = horizontal
    ? { x: (start.x + end.x) / 2, y: start.y }
    : { x: start.x, y: (start.y + end.y) / 2 };
  const second = horizontal
    ? { x: (start.x + end.x) / 2, y: end.y }
    : { x: end.x, y: (start.y + end.y) / 2 };
  return `${head} C ${round(first.x)} ${round(first.y)} ${round(second.x)} ${round(second.y)}`
    + ` ${round(end.x)} ${round(end.y)}`;
}

/**
 * 線の中点。**経路に依らず両端の真ん中**に置く。
 *
 * 経路に沿った本当の中点を取らない。折れ線とカーブで取っ手の位置が変わると、引き回しを
 * 選び直すだけで「その中点から引いた線」の付け根が動く。両端の真ん中なら引き回しと独立に決まる。
 */
export function midpointOf(geometry: ConnectorGeometry): { readonly x: number; readonly y: number } {
  return {
    x: round((geometry.start.x + geometry.end.x) / 2),
    y: round((geometry.start.y + geometry.end.y) / 2),
  };
}

/**
 * 矢尻の三角形。`point` が先端で、`angle` の**逆向き**へ開く。
 *
 * 角度は端の点が持つ「線が伸びていく向き」をそのまま受ける。呼ぶ側で反転させる約束にすると、
 * 始端と終端のどちらかで必ず反転を書き忘れ、片方だけ内側を向いた矢尻になる。
 */
export function arrowHeadPath(
  point: { readonly x: number; readonly y: number },
  angle: number,
  size: number,
): string {
  // 先端は線が伸びていく向きの**反対側**（線の外へ出ない位置）に置く。
  const tipAngle = angle + Math.PI;
  const spread = 0.42;
  const corner = (offset: number) => ({
    x: point.x - size * Math.cos(tipAngle + offset),
    y: point.y - size * Math.sin(tipAngle + offset),
  });
  const left = corner(spread);
  const right = corner(-spread);
  return `M ${round(point.x)} ${round(point.y)} L ${round(left.x)} ${round(left.y)} `
    + `L ${round(right.x)} ${round(right.y)} Z`;
}

/** 小数は 2 桁で切る。属性の文字列が指の動きごとに 17 桁で書き換わるのを避ける。 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
