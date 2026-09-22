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
  /**
   * 弦から**どちらへどれだけ張り出しているか**（`clockwiseBow`）。張り出していない線には持たない。
   *
   * 経路の文字列だけを持たない。線の中点（`midpointOf`）は取っ手・添え字・別の線の取り付き先に
   * なるので、張り出したぶんを知らないと**線から浮いた場所**を指す。
   */
  readonly bow?: { readonly x: number; readonly y: number };
}

/**
 * 線の端になれるもの。**箱（札）か、大きさを持たない点**（別の線の中点に取り付いた端）。
 *
 * 点を「幅 0・高さ 0 の箱」として渡させない。`borderPoint` は中心から縁までの倍率を出すので、
 * 0 の辺では倍率が無限大になり、縮退した箱だけ別の経路をたどる。種別で分けて、点はそのまま返す。
 */
export type ConnectorEnd = ChartNode | { readonly x: number; readonly y: number };

/** 図の上の 1 点。中心・縁・制御点を同じ形で扱うための短縮。 */
type Point = { readonly x: number; readonly y: number };

/**
 * 幾何に効く見た目だけ。**引き回しと端の印**を 1 つの塊で受ける。
 *
 * 引き回しだけを受け取って端の印を別引数の任意にしない。カーブの張り出し（`clockwiseBow`）は
 * 印を見て決めるので、渡し忘れた呼び出しだけが黙って昔の形へ戻る。塊で受ければ、引き回しを
 * 渡す側は必ず印も決めることになる。
 */
export type ConnectorLook = Pick<DiagramLineLook, 'route' | 'start' | 'end'>;

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
 * 折れ線・カーブが端で走る軸。**中心どうしの離れ方が大きいほう**を選ぶ。
 *
 * 曲げる軸と端の取り付き位置は同じ 1 つの決定から出す。別々に決めると、縁で切り詰めた 2 点から
 * 選び直した軸が中心で選んだ軸と食い違い、札の横腹から出た線がすぐ縦へ折れる形が出る。
 */
export type RouteAxis = 'horizontal' | 'vertical';

export function routeAxis(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): RouteAxis {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'horizontal' : 'vertical';
}

/**
 * 接続線 1 本の幾何。**箱が重なっている（中心が同じ）ときは `null`**。
 *
 * `null` を返すのは、向きが決まらない線に印を付けると角度が 0 に倒れ、どちらを向いているとも
 * 読めない矢尻が原点向きで残るため。描かないほうが「線がまだ引けていない」と分かる。
 *
 * **端は経路に合わせて取る。** 直線は相手の中心を向いた縁の点、折れ線とカーブは**自分の中心から
 * 軸に沿って伸ばした先**の縁の点（＝その辺の中央）に取り付く。折れ線の端を相手の中心向きで取ると、
 * 斜めに離れた 2 つでは角の近くに当たり、縦横にしか進めない線が札の角から生えて見える（家族の線は
 * 最初から辺の中央へ降ろしており、手で引いた線だけがこの決め方から外れていた）。
 */
export function connectorGeometry(
  from: ConnectorEnd,
  to: ConnectorEnd,
  spacing: DiagramSpacing,
  look: ConnectorLook,
): ConnectorGeometry | null {
  const route = look.route;
  const fromCentre = centreOf(from, spacing);
  const toCentre = centreOf(to, spacing);
  if (fromCentre.x === toCentre.x && fromCentre.y === toCentre.y) return null;
  if (route === 'straight') {
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
  const axis = routeAxis(fromCentre, toCentre);
  // 軸の向きだけを見た行き先。横なら相手の x へ真横、縦なら相手の y へ真下（真上）。
  const along = (
    centre: { readonly x: number; readonly y: number },
    other: { readonly x: number; readonly y: number },
  ) => (axis === 'horizontal' ? { x: other.x, y: centre.y } : { x: centre.x, y: other.y });
  const start = borderPoint(from, spacing, along(fromCentre, toCentre));
  const end = borderPoint(to, spacing, along(toCentre, fromCentre));
  const bow = clockwiseBow({
    look,
    axis,
    centres: { from: fromCentre, to: toCentre },
    edges: { start, end },
    spacing,
  });
  if (bow !== null) return bowedCurve(start, end, bow);
  // 端の印の向きも軸へ揃える。中心どうしの角度のままだと、真横から入る線に斜めの矢尻が付く。
  const angle = axis === 'horizontal'
    ? (toCentre.x >= fromCentre.x ? 0 : Math.PI)
    : (toCentre.y >= fromCentre.y ? Math.PI / 2 : -Math.PI / 2);
  return {
    start: { ...start, angle },
    end: { ...end, angle: angle + Math.PI },
    path: routePath(start, end, route, axis),
  };
}

/**
 * 揃って並んだ 2 つを結ぶカーブの張り出し。**片端が矢印のときだけ**返す（他は `null`）。
 *
 * 上下（左右）に揃っていると、軸の上だけを通るカーブは直線と同じ形に潰れ、「カーブ」を選んだのに
 * 何も変わらない。そこで軸と直交する側へ張り出して、見た目にも曲線にする。
 *
 * 張り出す側は**矢印の向きから見て右回り**。矢印の無い線を曲げないのは、向きの無い線では
 * 右回り・左回りの区別が読み手に伝わらず、ただ遠回りした線に見えるため。両端が矢印なら
 * 書いてある順（始点 → 終点）を線の進む向きとする。
 */
function clockwiseBow(input: {
  readonly look: ConnectorLook;
  readonly axis: RouteAxis;
  /** 2 つの箱の中心。揃っているか・どちらへ進むかを決める。 */
  readonly centres: { readonly from: Point; readonly to: Point };
  /** 縁で切り詰めた端の点。張り出しの深さを距離から決める。 */
  readonly edges: { readonly start: Point; readonly end: Point };
  readonly spacing: DiagramSpacing;
}): Point | null {
  const { look, axis, centres, edges, spacing } = input;
  if (look.route !== 'curved') return null;
  if (look.start !== 'arrow' && look.end !== 'arrow') return null;
  const aligned = axis === 'vertical' ? centres.from.x === centres.to.x : centres.from.y === centres.to.y;
  if (!aligned) return null;
  // 線の進む向き（矢印の指す先へ向かう向き）。終点側に印が無ければ、進むのは始点へ向かう側。
  const forward = look.end === 'arrow' ? 1 : -1;
  const travel = axis === 'vertical'
    ? { x: 0, y: Math.sign(centres.to.y - centres.from.y) * forward }
    : { x: Math.sign(centres.to.x - centres.from.x) * forward, y: 0 };
  // 画面の y は下向き。時計回りに進む弧は回転の中心と反対側へ膨らむので、張り出すのは進む向きを
  // (y, -x) へ回した側になる（回転そのものが時計回りなのではない）。
  const side = { x: travel.y, y: -travel.x };
  const length = Math.abs(axis === 'vertical' ? edges.end.y - edges.start.y : edges.end.x - edges.start.x);
  const span = axis === 'vertical' ? spacing.nodeWidth : spacing.nodeHeight;
  // 深さは距離に比例させつつ、**札の交差軸側の大きさ**で上下から挟む。下限は隣り合う 2 つ（間が
  // 刻みの隙間しかない）でほぼ直線に潰れないため。上限は図の縁で切られないため — 描画面は札の
  // 占める升目からしか決まらず、線の経路を含めない（`diagram-viewer` の `surface`）。半分までなら
  // 制御点は札の縁より外へ出ないので、最上段・最左列でも負の座標へ回り込まない。
  const reach = Math.min(
    Math.max(length * CURVE_BOW_RATIO, span * CURVE_BOW_MIN_RATIO),
    span * CURVE_BOW_MAX_RATIO,
  );
  return { x: side.x * reach, y: side.y * reach };
}

/** 張り出しの深さ。端どうしの距離に対する制御点の持ち上げ幅（実際の膨らみはこの 3/4）。 */
const CURVE_BOW_RATIO = 0.3;
/** 張り出しの下限。札の交差軸側の大きさに対する割合。 */
const CURVE_BOW_MIN_RATIO = 0.25;
/** 張り出しの上限。札の交差軸側の**半分**まで（制御点が札の縁より外へ出ない）。 */
const CURVE_BOW_MAX_RATIO = 0.5;
/** 3 次ベジェの中点が制御点から受け取る割合。`B(0.5)` の重みが (3+3)/8 になるため。 */
const BOW_MIDPOINT_SHARE = 0.75;

/**
 * 張り出したカーブ 1 本。**端の印の向きは曲線の接線から出す。**
 *
 * 軸の向き（真下・真横）のままにしない。張り出したぶん曲線は斜めに出ていくので、軸で決めた
 * 矢尻だけが線から浮く。
 */
function bowedCurve(start: Point, end: Point, bow: Point): ConnectorGeometry {
  const at = (ratio: number): Point => ({
    x: start.x + (end.x - start.x) * ratio + bow.x,
    y: start.y + (end.y - start.y) * ratio + bow.y,
  });
  const first = at(1 / 3);
  const second = at(2 / 3);
  return {
    start: { ...start, angle: Math.atan2(first.y - start.y, first.x - start.x) },
    // 終端から線が伸びていく向きは、最後の制御点へ戻る向き（矢尻は線の進む先を向く）。
    end: { ...end, angle: Math.atan2(second.y - end.y, second.x - end.x) },
    path: `M ${round(start.x)} ${round(start.y)} C ${round(first.x)} ${round(first.y)}`
      + ` ${round(second.x)} ${round(second.y)} ${round(end.x)} ${round(end.y)}`,
    bow,
  };
}

/**
 * 2 点を結ぶ経路。**受け取った端の点は動かさない。**
 *
 * どこへ取り付くかは呼ぶ側（`connectorGeometry`）が経路と一緒に決める。ここで端を選び直すと、
 * 家族の線（結び目から子の辺の中央へ降ろす）と手で引いた線とで取り付きの決め方が二重になる。
 *
 * `axis` は曲げる軸。省略すると渡された 2 点から選ぶ（家族の線はこちら。結び目も子の取り付きも
 * 点で渡すので、縁で切り詰めたことによる食い違いが起きない）。
 */
export function routePath(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  route: DiagramLineRoute,
  axis?: RouteAxis,
): string {
  const head = `M ${round(start.x)} ${round(start.y)}`;
  if (route === 'straight') return `${head} L ${round(end.x)} ${round(end.y)}`;
  // 長いほうの軸から曲げる。短いほうから曲げると、横に長い図で線が縦へ大きく張り出して
  // 間の札を横切る。
  const horizontal = (axis ?? routeAxis(start, end)) === 'horizontal';
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
 * 線の中点。**両端の真ん中**に置き、**張り出したぶんだけ線へ寄せる**。
 *
 * 経路に沿った本当の中点は取らない。折れ線で折れ方に追わせると、引き回しを選び直すだけで
 * 「その中点から引いた線」の付け根が動く。両端の真ん中なら引き回しと独立に決まる。
 *
 * 張り出し（`geometry.bow`）だけは足す。この点は取っ手・添え字・別の線の取り付き先になるので、
 * 弦の真ん中のままだと**線から離れた空間**に取っ手が浮き、そこから別の線が生える。同じ 2 点・
 * 同じ端の印なら張り出しも同じなので、位置が独立に決まる性質は保たれる。
 */
export function midpointOf(geometry: ConnectorGeometry): { readonly x: number; readonly y: number } {
  const bow = geometry.bow ?? { x: 0, y: 0 };
  return {
    x: round((geometry.start.x + geometry.end.x) / 2 + bow.x * BOW_MIDPOINT_SHARE),
    y: round((geometry.start.y + geometry.end.y) / 2 + bow.y * BOW_MIDPOINT_SHARE),
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
