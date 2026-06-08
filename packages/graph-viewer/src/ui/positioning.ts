/**
 * ポータル系コンポーネント（Menu / Popover）共通の配置計算。
 * anchorEl 基準点の算出と、transformOrigin から CSS translate 値への変換を提供する。
 */

export interface MenuOrigin {
  readonly vertical: 'top' | 'center' | 'bottom';
  readonly horizontal: 'left' | 'center' | 'right';
}

export interface MenuPosition {
  readonly top: number;
  readonly left: number;
}

export const DEFAULT_ANCHOR_ORIGIN: MenuOrigin = { vertical: 'bottom', horizontal: 'left' };
export const DEFAULT_TRANSFORM_ORIGIN: MenuOrigin = { vertical: 'top', horizontal: 'left' };

/** transformOrigin の各軸を CSS translate のパーセント値へ変換する。 */
export function axisPercent(value: 'top' | 'center' | 'bottom' | 'left' | 'right'): string {
  if (value === 'center') return '-50%';
  if (value === 'bottom' || value === 'right') return '-100%';
  return '0';
}

/** anchorEl と anchorOrigin から画面座標の基準点を求める。 */
export function anchorPoint(el: HTMLElement, origin: MenuOrigin): MenuPosition {
  const r = el.getBoundingClientRect();
  const left =
    origin.horizontal === 'left' ? r.left : origin.horizontal === 'right' ? r.right : r.left + r.width / 2;
  const top =
    origin.vertical === 'top' ? r.top : origin.vertical === 'bottom' ? r.bottom : r.top + r.height / 2;
  return { top, left };
}
