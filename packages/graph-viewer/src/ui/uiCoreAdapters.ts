/**
 * ui-core ファクトリ（ハンドル返し）を gv ui-vanilla の要素返し呼び出し規約へ合わせる
 * 移行期アダプタ。
 *
 * graph-viewer の呼び出し側は要素（Node）を children として直接合成するため、
 * `{ el, ... }` ハンドルから `.el` を取り出す変換と、gv 既定意匠のうち ui-core の
 * 既定と異なる値（Divider の margin 等）の付与をここへ一元化する。対象の部品は
 * static content / 使い捨てで update・destroy を使わない（listener は要素の GC と
 * 共に回収される）。
 *
 * ui-vanilla 撤去（フェーズ4）完了後、意匠を ui-core 標準へ寄せるかの判断とセットで
 * 削除候補（graphMenu.ts と同じ位置づけ）。
 */

import { createButton } from '@anytime-markdown/ui-core/Button';
import { createChip } from '@anytime-markdown/ui-core/Chip';
import { createIconButton } from '@anytime-markdown/ui-core/IconButton';
import { createDivider } from '@anytime-markdown/ui-core/Divider';
import { createListItemIcon } from '@anytime-markdown/ui-core/ListItemIcon';
import { createListItemText } from '@anytime-markdown/ui-core/ListItemText';
import { createText } from '@anytime-markdown/ui-core/Text';
import { applyStyle, ensureStyle, type VanillaContent } from '@anytime-markdown/ui-core/dom';

/** gv createListItemIcon 互換（要素返し）。色・幅は --am-color-action-active / --am-menu-icon-minw。 */
export const listItemIcon = (
  o: Parameters<typeof createListItemIcon>[0],
): HTMLSpanElement => createListItemIcon(o).el;

/** gv createListItemText 互換（要素返し）。flex 伸長・省略表示は ui-core 側の既定。 */
export const listItemText = (
  o: Parameters<typeof createListItemText>[0],
): HTMLSpanElement => createListItemText(o).el;

/**
 * gv createDivider 互換（要素返し）。gv 既定意匠の margin 4px 0（.gv-divider /
 * .gv-divider--vertical 共通）を維持しつつ、呼び元の style 指定を優先する。
 * 色は --am-color-divider（= --gv-color-divider と同値）。
 */
export const divider = (
  o: Parameters<typeof createDivider>[0] = {},
): HTMLHRElement => createDivider({ ...o, style: { margin: '4px 0', ...o.style } }).el;

/** gv createButton 互換のオプション（ui-vanilla/Button.ts の CreateButtonProps と同形）。 */
export interface GvButtonProps {
  readonly variant?: 'text' | 'outlined' | 'contained';
  readonly size?: 'small' | 'medium';
  readonly startIcon?: Node;
  readonly children?: VanillaContent;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly type?: 'button' | 'submit' | 'reset';
  readonly title?: string;
  readonly onClick?: (e: MouseEvent) => void;
}

// gv-btn の意匠（radius 4 / weight 500 / lh 1.75 / gv 寸法）。ui-core Button の
// inline cssText（radius 8 / weight 600 / MUI 寸法）との差分を上書きする。
const GV_BTN_STYLE: Record<'small' | 'medium', string> = {
  small: 'border-radius:4px;font-weight:500;line-height:1.75;font-size:0.75rem;padding:3px 8px;min-height:26px;',
  medium: 'border-radius:4px;font-weight:500;line-height:1.75;font-size:0.8125rem;padding:4px 10px;min-height:30px;',
};

/**
 * gv createButton 互換（要素返し）。ui-core Button は hover / disabled / focus の
 * 状態表現を持たないため、gv-btn の従来挙動（action-hover 背景・contained の
 * brightness 0.92・disabled opacity 0.5・focus-visible リング）をここで補完する。
 */
export function button(o: GvButtonProps = {}): HTMLButtonElement {
  const variant = o.variant ?? 'text';
  const { el } = createButton({
    variant,
    size: o.size ?? 'medium',
    startIcon: o.startIcon,
    children: o.children,
    className: o.className,
    disabled: o.disabled,
    buttonType: o.type,
    title: o.title,
  });
  el.style.cssText += GV_BTN_STYLE[o.size ?? 'medium'];
  el.setAttribute('data-gv-btn', '');
  // focus リングは inline で表現できないため stylesheet で補完する（outline は
  // inline 指定が無く通常規則で効く）。hover 背景は inline background と競合するため
  // pointerenter / pointerleave で切り替える（ui-core MenuItem と同じ方式）。
  ensureStyle(
    'gv-uicore-btn-parity',
    '[data-gv-btn]:focus-visible{outline:2px solid var(--am-color-primary-main);outline-offset:1px;}',
  );
  if (o.disabled) {
    el.style.opacity = '0.5';
    el.style.cursor = 'default';
  } else {
    el.addEventListener('pointerenter', () => {
      if (variant === 'contained') el.style.filter = 'brightness(0.92)';
      else el.style.backgroundColor = 'var(--am-color-action-hover)';
    });
    el.addEventListener('pointerleave', () => {
      if (variant === 'contained') el.style.filter = '';
      else el.style.backgroundColor = 'transparent';
    });
  }
  if (o.onClick) el.addEventListener('click', o.onClick);
  return el;
}

// gv-chip の意匠（action-selected 背景の角丸ピル）。ui-core Chip の inline cssText
// （transparent 背景・radius 16・MUI 寸法）との差分を上書きする。
const GV_CHIP_STYLE: Record<'small' | 'medium', string> = {
  small: 'gap:4px;height:20px;padding:0 6px;border-radius:12px;font-size:0.6875rem;line-height:1;background-color:var(--am-color-action-selected);',
  medium: 'gap:4px;height:24px;padding:0 8px;border-radius:12px;font-size:0.75rem;line-height:1;background-color:var(--am-color-action-selected);',
};

/** gv createIconButton 互換のオプション（ui-vanilla/IconButton.ts の CreateIconButtonProps と同形）。 */
export interface GvIconButtonProps {
  readonly size?: 'small' | 'medium';
  readonly children?: VanillaContent;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly type?: 'button' | 'submit' | 'reset';
  readonly title?: string;
  readonly ariaLabel?: string;
  readonly onClick?: (e: MouseEvent) => void;
}

/**
 * gv createIconButton 互換（要素返し）。
 *
 * - サイズ写像: gv medium（padding 5px）→ ui-core small / gv small（4px）→ ui-core compact
 * - disabled opacity は gv の 0.38 を stylesheet で上書き（ui-core 共有ルールの 0.5 より
 *   後に注入され同 specificity のため勝つ）
 * - hover 背景: ui-core は inline `background:transparent` が共有ルールの `:hover` に勝ち
 *   無効化されるため、pointerenter / pointerleave で切り替える。呼び出し側が selected 状態の
 *   背景（accent 系）を inline 指定している場合は上書きしない（gv の CSS hover が inline に
 *   負けていた従来挙動と一致）
 */
export function iconButton(o: GvIconButtonProps = {}): HTMLButtonElement {
  const { el } = createIconButton({
    size: (o.size ?? 'medium') === 'small' ? 'compact' : 'small',
    children: o.children,
    className: o.className,
    disabled: o.disabled,
    type: o.type,
    title: o.title,
    ariaLabel: o.ariaLabel,
    onClick: o.onClick,
  });
  el.setAttribute('data-gv-icon-btn', '');
  ensureStyle(
    'gv-uicore-iconbtn-parity',
    'button[data-gv-icon-btn]:disabled{opacity:0.38;}',
  );
  el.addEventListener('pointerenter', () => {
    const bg = el.style.backgroundColor;
    if (!el.disabled && (bg === '' || bg === 'transparent')) {
      el.style.backgroundColor = 'var(--am-color-action-hover)';
    }
  });
  el.addEventListener('pointerleave', () => {
    if (el.style.backgroundColor === 'var(--am-color-action-hover)') {
      el.style.backgroundColor = '';
    }
  });
  return el;
}

/** gv createText 互換のオプション（ui-vanilla/Text.ts の CreateTextProps と同形）。 */
export interface GvTextProps {
  readonly variant?: 'body' | 'caption' | 'subtitle2';
  readonly color?: 'text.secondary' | 'error' | 'inherit';
  readonly style?: Partial<CSSStyleDeclaration>;
  readonly className?: string;
  readonly children?: VanillaContent;
  readonly title?: string;
}

// gv-text 系の意匠。ui-core Text の MUI スケール（letter-spacing 付き・subtitle2 weight 500）
// との差分を上書きする。body は gv 同様フォントを親から継承する（パネルの font-size に追従）。
const GV_TEXT_STYLE: Record<'body' | 'caption' | 'subtitle2', string> = {
  body: 'font:inherit;letter-spacing:normal;margin:0;',
  caption: 'font-size:0.75rem;font-weight:400;line-height:1.66;letter-spacing:normal;margin:0;',
  subtitle2: 'font-size:0.875rem;font-weight:600;line-height:1.57;letter-spacing:normal;margin:0;',
};

/** gv createText 互換（要素返し・span 固定）。色は --am-color-*（gv と同値）で表現する。 */
export function text(o: GvTextProps = {}): HTMLElement {
  const color =
    o.color === 'text.secondary'
      ? 'color:var(--am-color-text-secondary);'
      : o.color === 'error'
        ? 'color:var(--am-color-error-main);'
        : '';
  const { el } = createText({
    // caption はタグが span（gv と同じ）。フォント値は style で全上書きするため
    // variant の選択はタグ決定のためだけに働く。
    variant: 'caption',
    className: o.className,
    children: o.children,
    style: GV_TEXT_STYLE[o.variant ?? 'body'] + color,
  });
  if (o.title !== undefined) el.title = o.title;
  applyStyle(el, o.style);
  return el;
}

/** gv createChip 互換（要素返し・ラベルのみ。gv の onDelete は graph-viewer 内で未使用）。 */
export function chip(o: {
  readonly label: VanillaContent;
  readonly size?: 'small' | 'medium';
  readonly style?: Partial<CSSStyleDeclaration>;
  readonly className?: string;
}): HTMLElement {
  const { el } = createChip({ label: o.label, size: o.size, className: o.className });
  el.style.cssText += GV_CHIP_STYLE[o.size ?? 'medium'];
  applyStyle(el, o.style);
  return el;
}
