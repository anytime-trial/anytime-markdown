/**
 * 札の形（フローチャート図形）の輪郭。DOM を触らないので、node 環境の検査から直接測れる。
 *
 * **形ごとに「札自身が CSS で描く」か「SVG の path で描く」かが分かれる。** 四角・角丸・端子・円は
 * `border-radius` だけで描けるので `null` を返し、札の枠と背景をそのまま使う。残り 4 つは
 * `border-radius` では表せないので path を返す。
 *
 * 描ける形をすべて SVG へ寄せない。編集中の札は `overflow: hidden` で（接続点を辺の内側へ
 * 追いやったのと同じ制約）、輪郭線の外半分が切り取られる。CSS の枠は箱の内側へ描かれるので
 * 切られない — 切られない形をわざわざ切られる描き方へ移す理由が無い。
 */

import type { DiagramDocument, DiagramShape } from './types';
import { DEFAULT_DIAGRAM_SHAPE } from './types';

/**
 * 輪郭を箱の縁から内側へ寄せる幅（px）。
 *
 * 0 にすると、線の**外半分**が札の `overflow: hidden` に切られ、上下左右の端だけ線が細くなる。
 * 太さは倍率で変わる（`clamp(1.5px, 1.5px / 倍率, 10px)`）ので寄せ幅では全域を救えないが、
 * 既定の倍率で線が痩せないことを保つ。
 */
export const SHAPE_OUTLINE_INSET = 1;

/** 円筒の蓋の深さ（縦半径）の上限（px）。箱を高くしても蓋だけが伸び続けないようにする。 */
const CYLINDER_LID_MAX = 14;

export interface ShapeOutline {
  /** 塗りと輪郭。閉じた path。 */
  readonly outline: string;
  /** 輪郭に重ねる線だけの装飾（円筒の蓋の弧）。無ければ `null`。 */
  readonly detail: string | null;
}

/**
 * その要素の形。**書いていない要素は四角**。
 *
 * 既定をここに 1 つだけ置く。画面（区画に出す今の値）と描画（実際に描く形）が別々に既定を
 * 持つと、触っていない要素で「区画の表示と図が食い違う」状態ができる（家族の線の `familyLook`
 * と同じ理由）。
 */
export function diagramShapeOf(document: DiagramDocument, name: string): DiagramShape {
  return document.shapes[name] ?? DEFAULT_DIAGRAM_SHAPE;
}

/** 四角の札の文字の余白（px）。形を変えない札はこの値のまま。 */
const RECT_TEXT_INSET = { x: 8, y: 4 } as const;

/**
 * 形の中に文字を収める余白（px）。**札の大きさに対する割合で決まる。**
 *
 * CSS の百分率のパディングでは表せない。百分率は**自分の大きさではなく親の幅**を基準に解決
 * するため、図の面（数千 px）に対する割合になり、札が升目を丸ごと食い破る（実機で観測。
 * 札の当たり判定が 1255 × 801px まで膨らんだ）。px は札の大きさから毎回引き直す。
 */
export function shapeTextInset(
  shape: DiagramShape,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } {
  const scaled = (x: number, y: number) => ({
    // 四角の余白を下回らない。細い札で割合を素直に当てると、字が枠に貼り付く。
    x: Math.max(RECT_TEXT_INSET.x, Math.round(width * x)),
    y: Math.max(RECT_TEXT_INSET.y, Math.round(height * y)),
  });
  switch (shape) {
    case 'rect':
    case 'round':
      return RECT_TEXT_INSET;
    // 端子と円は左右が丸く落ちるので、横だけを広く取る。
    case 'stadium':
    case 'circle':
      return scaled(0.14, 0.04);
    // ひし形は四隅がすべて欠けるので、縦横ともに逃がす。
    case 'diamond':
      return scaled(0.22, 0.14);
    case 'parallelogram':
    case 'hexagon':
      return scaled(0.16, 0.04);
    // 円筒は上下の蓋の中へ字が入らないようにする。
    case 'cylinder':
      return scaled(0.06, 0.14);
    default: {
      const exhaustive: never = shape;
      return exhaustive;
    }
  }
}

/**
 * 形 1 つの輪郭。**CSS だけで描ける形は `null`**。
 *
 * 寸法が 0 以下でも例外を投げない。箱の大きさは指のドラッグで決まり、途中の 1 フレームに
 * 潰れた値が来る。そこで例外を投げると、図そのものが消える。
 */
export function shapeOutline(shape: DiagramShape, width: number, height: number): ShapeOutline | null {
  const left = SHAPE_OUTLINE_INSET;
  const top = SHAPE_OUTLINE_INSET;
  // 潰れた箱では縁が入れ替わりうる（右 < 左）。入れ替わったままだと負の半径や NaN が path へ
  // 出るので、線分 1 本に畳む。
  const right = Math.max(left, width - SHAPE_OUTLINE_INSET);
  const bottom = Math.max(top, height - SHAPE_OUTLINE_INSET);
  const inner = { width: right - left, height: bottom - top };
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;

  switch (shape) {
    case 'rect':
    case 'round':
    case 'stadium':
    case 'circle':
      return null;
    case 'diamond':
      return { outline: polygon([[cx, top], [right, cy], [cx, bottom], [left, cy]]), detail: null };
    case 'parallelogram': {
      const slant = slantOf(inner);
      return {
        outline: polygon([[left + slant, top], [right, top], [right - slant, bottom], [left, bottom]]),
        detail: null,
      };
    }
    case 'hexagon': {
      const slant = slantOf(inner);
      return {
        outline: polygon([
          [left + slant, top], [right - slant, top], [right, cy],
          [right - slant, bottom], [left + slant, bottom], [left, cy],
        ]),
        detail: null,
      };
    }
    case 'cylinder': {
      const rx = inner.width / 2;
      const ry = Math.min(inner.height / 4, CYLINDER_LID_MAX);
      const lid = top + ry;
      const foot = bottom - ry;
      return {
        outline: `M ${round(left)} ${round(lid)} ${arc(rx, ry, 1, right, lid)} `
          + `L ${round(right)} ${round(foot)} ${arc(rx, ry, 1, left, foot)} Z`,
        // 蓋は**下側の弧だけ**を線で描く。上側は本体の輪郭が既に描いており、重ねると
        // 半透明の配色でその 1 本だけ濃く出る。
        detail: `M ${round(left)} ${round(lid)} ${arc(rx, ry, 0, right, lid)}`,
      };
    }
    default: {
      // 形を足したのにここへ来たら、その形は描き方を決めていない。`never` で型検査に拾わせる。
      const exhaustive: never = shape;
      return exhaustive;
    }
  }
}

/**
 * 上辺・下辺を斜めに落とす量。**幅と高さの小さいほうに従う。**
 *
 * 幅だけで決めると、平たい箱で斜めの辺が寝すぎて六角形が菱形に見える。高さだけで決めると、
 * 細長い箱で左右の三角が箱の半分を食う。
 */
function slantOf(inner: { readonly width: number; readonly height: number }): number {
  return Math.min(inner.width / 4, inner.height / 2);
}

function polygon(points: readonly (readonly [number, number])[]): string {
  return `${points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`)
    .join(' ')} Z`;
}

/** 楕円の弧 1 本。`sweep` は 1 が時計回り（画面座標は y が下向き）。 */
function arc(rx: number, ry: number, sweep: 0 | 1, x: number, y: number): string {
  return `A ${round(rx)} ${round(ry)} 0 0 ${sweep} ${round(x)} ${round(y)}`;
}

/** 小数は 2 桁で切る（`connectors.ts` と同じ。属性が指の動きごとに 17 桁で書き換わるのを避ける）。 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
