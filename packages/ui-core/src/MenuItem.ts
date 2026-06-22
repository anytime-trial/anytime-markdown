/**
 * 脱React の vanilla DOM MenuItem ファクトリ（MUI MenuItem / ui/MenuItem.tsx 置換）。
 *
 * `<li role="menuitem">`。`ui/MenuItem.module.css` の見た目（gutters 16px / hover / selected /
 * disabled / dense）を素 DOM で再現する。React 版は dense を MenuList の context から継承するが、
 * vanilla では context が無いため `dense` を明示プロパティで受ける（createMenuList が子へ伝播する）。
 * テーマ色は `--am-color-*` CSS 変数で追従し React テーマ API に依存しない。
 * `Button.ts` の cssText + addEventListener パターンに揃える。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** {@link createMenuItem} のオプション。React `MenuItemProps` の vanilla 再現範囲。 */
export interface CreateMenuItemOptions {
  /** 項目内容（ListItemIcon / ListItemText 等。string / Node / その配列）。 */
  children?: VanillaContent;
  /** 選択状態（action.selected 背景）。 */
  selected?: boolean;
  /** 無効状態（opacity 0.38・pointer-events none）。 */
  disabled?: boolean;
  /** 高密度（minHeight 32 / padding 4px / body2）。createMenuList から伝播。 */
  dense?: boolean;
  /** role 属性（既定 "menuitem"）。 */
  role?: string;
  /** li の tabIndex（既定 -1。roving tabindex は MenuList 側が制御）。 */
  tabIndex?: number;
  /** 追加クラス名。 */
  className?: string;
  /** 追加スタイル（consumer 最優先。fontSize / minHeight 等）。 */
  style?: Partial<CSSStyleDeclaration>;
  /** data-testid 属性。 */
  testId?: string;
  /** クリックハンドラ。 */
  onClick?: (event: MouseEvent) => void;
}

// ui/MenuItem.module.css .menuItem と一字一句対応。寸法・フォントは CSS 変数で受ける
// （Menu の paper レベル上書きを ancestor 継承で反映できる）。
const BASE_CSS =
  "display:flex;align-items:center;box-sizing:border-box;" +
  "min-height:var(--am-menu-item-minh, 48px);" +
  "padding:var(--am-menu-item-pad-y, 6px) var(--am-menu-item-pad-x, 16px);" +
  "white-space:nowrap;cursor:pointer;user-select:none;" +
  "color:var(--am-color-text-primary);font-size:var(--am-menu-item-font, 1rem);" +
  "background-color:transparent;" +
  "transition:background-color var(--am-duration-fast) var(--am-ease-standard);";

// .dense: minHeight 32 / padding 4px / body2（CSS 変数を局所上書き）。
const DENSE_CSS =
  "--am-menu-item-minh:32px;--am-menu-item-pad-y:4px;--am-menu-item-font:0.875rem;";

// .selected: action.selected 背景。
const SELECTED_CSS = "background-color:var(--am-color-action-selected);";

// .disabled: opacity 0.38・pointer-events none。
const DISABLED_CSS = "opacity:0.38;cursor:default;pointer-events:none;";

/** state から cssText を組み立てる。consumer の style はこの後 applyStyle で最優先される。 */
function buildCss(state: { dense: boolean; selected: boolean; disabled: boolean }): string {
  let css = BASE_CSS;
  if (state.dense) css += DENSE_CSS;
  if (state.selected) css += SELECTED_CSS;
  if (state.disabled) css += DISABLED_CSS;
  return css;
}

/**
 * vanilla MenuItem を生成する。
 *
 * hover / focus-visible 背景は cssText では表現できないため `pointerenter` / `pointerleave` で
 * action.hover 背景をトグルする（selected / disabled 時は適用しない。CSS の :hover:not(.disabled)
 * / .selected:hover 相当）。
 *
 * @returns `el`（li 要素）と `update`（可変プロパティ反映）/ `destroy`（listener 削除）。
 */
export function createMenuItem(opts: CreateMenuItemOptions = {}): {
  el: HTMLLIElement;
  update: (next: Partial<CreateMenuItemOptions>) => void;
  destroy: () => void;
} {
  const state = {
    dense: opts.dense ?? false,
    selected: opts.selected ?? false,
    disabled: opts.disabled ?? false,
  };
  let extraStyle = opts.style;

  const el = document.createElement("li");
  el.setAttribute("role", opts.role ?? "menuitem");
  el.tabIndex = opts.tabIndex ?? -1;
  if (opts.className) el.className = opts.className;
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  const applyVisual = (): void => {
    el.style.cssText = buildCss(state);
    applyStyle(el, extraStyle);
    if (state.disabled) {
      el.setAttribute("aria-disabled", "true");
    } else {
      el.removeAttribute("aria-disabled");
    }
  };
  applyVisual();
  appendContent(el, opts.children);

  // hover 背景（selected / disabled では付けない。CSS :hover:not(.disabled) / .selected:hover 相当）。
  const onPointerEnter = (): void => {
    if (state.disabled || state.selected) return;
    el.style.backgroundColor = "var(--am-color-action-hover)";
  };
  const onPointerLeave = (): void => {
    if (state.selected) return;
    el.style.backgroundColor = "transparent";
  };
  el.addEventListener("pointerenter", onPointerEnter);
  el.addEventListener("pointerleave", onPointerLeave);

  let clickHandler = opts.onClick;
  // disabled 時はクリックさせない（pointer-events:none でも programmatic click を弾く保険）。
  const onClick = (e: MouseEvent): void => {
    if (state.disabled) return;
    clickHandler?.(e);
  };
  el.addEventListener("click", onClick);

  return {
    el,
    update(next: Partial<CreateMenuItemOptions>) {
      let visualChanged = false;
      if (next.dense !== undefined) {
        state.dense = next.dense;
        visualChanged = true;
      }
      if (next.selected !== undefined) {
        state.selected = next.selected;
        visualChanged = true;
      }
      if (next.disabled !== undefined) {
        state.disabled = next.disabled;
        visualChanged = true;
      }
      if (next.style !== undefined) {
        extraStyle = next.style;
        visualChanged = true;
      }
      if (visualChanged) applyVisual();
      if (next.role !== undefined) el.setAttribute("role", next.role);
      if (next.tabIndex !== undefined) el.tabIndex = next.tabIndex;
      if (next.className !== undefined) el.className = next.className;
      if (next.children !== undefined) {
        for (const node of [...el.childNodes]) el.removeChild(node);
        appendContent(el, next.children);
      }
      if (next.onClick !== undefined) clickHandler = next.onClick;
    },
    destroy() {
      el.removeEventListener("pointerenter", onPointerEnter);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("click", onClick);
      clickHandler = undefined;
    },
  };
}
