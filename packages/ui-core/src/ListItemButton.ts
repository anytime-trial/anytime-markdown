/**
 * 脱React の vanilla DOM ファクトリ — ListItemButton（MUI ListItemButton /
 * `trail-viewer/src/ui/ListItemButton.tsx` 置換）。
 *
 * `<li role="button">` クリック可能なリスト行。`selected` 時は
 * `var(--am-color-action-selected)` 背景を適用し、hover 背景は `ensureStyle` で
 * pseudo-class スタイルを注入する（MenuItem.ts パターンと同様）。
 * テーマ色は `--am-color-*` CSS 変数で追従し React テーマ API に依存しない。
 */

import { appendContent, applyStyle, ensureStyle, type VanillaContent } from "./dom";

/** {@link createListItemButton} のオプション。React 版 ListItemButtonProps の vanilla 再現範囲。 */
export interface CreateListItemButtonOptions {
  /** 中身（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 選択状態（action.selected 背景）。 */
  selected?: boolean;
  /** クリックハンドラ。 */
  onClick?: (event: MouseEvent) => void;
  /** 右クリックハンドラ。 */
  onContextMenu?: (event: MouseEvent) => void;
  /** 無効状態（opacity 0.38・pointer-events none）。 */
  disabled?: boolean;
  /** 追加クラス名。 */
  className?: string;
  /** 追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** aria-label。 */
  ariaLabel?: string;
  /** data-testid 属性。 */
  testId?: string;
}

// hover 背景は pointerenter/pointerleave より :hover pseudo が扱いやすいため ensureStyle で注入。
// am-list-item-button クラスに紐づける。
const STYLE_ID = "am-list-item-button-styles";
const ensureListItemButtonStyles = (): void =>
  ensureStyle(
    STYLE_ID,
    `.am-list-item-button:not([aria-disabled="true"]):not([aria-selected="true"]):hover {
  background-color: var(--am-color-action-hover, rgba(0,0,0,0.04));
}`,
  );

const BASE_CSS =
  "display:flex;align-items:center;box-sizing:border-box;" +
  "min-height:48px;padding:8px 16px;" +
  "cursor:pointer;user-select:none;" +
  "color:var(--am-color-text-primary, inherit);background-color:transparent;" +
  "transition:background-color var(--am-duration-fast, 150ms) var(--am-ease-standard, ease);";

const SELECTED_CSS =
  "background-color:var(--am-color-action-selected, rgba(0,0,0,0.08));";

const DISABLED_CSS = "opacity:0.38;cursor:default;pointer-events:none;";

function buildCss(state: { selected: boolean; disabled: boolean }): string {
  let css = BASE_CSS;
  if (state.selected) css += SELECTED_CSS;
  if (state.disabled) css += DISABLED_CSS;
  return css;
}

/**
 * ListItemButton（`<li role="button">` クリック可能行）を生成する。
 *
 * **a11y 制約**: `el` は必ず `<ul>`・`<ol>`・または `role="list"` / `role="listbox"` を持つ
 * コンテナの直接子として配置すること。`<li>` は list コンテキスト外では
 * ARIA の implicit role（listitem）を失い、スクリーンリーダーが正しく読み上げない。
 *
 * @returns `el`（li 要素）と `update`（可変プロパティ反映）/ `destroy`（listener 削除）。
 */
export function createListItemButton(opts: CreateListItemButtonOptions = {}): {
  el: HTMLLIElement;
  update(next: Partial<CreateListItemButtonOptions>): void;
  destroy(): void;
} {
  ensureListItemButtonStyles();

  const state = {
    selected: opts.selected ?? false,
    disabled: opts.disabled ?? false,
  };
  let extraStyle = opts.style;

  const el = document.createElement("li");
  el.setAttribute("role", "button");
  el.tabIndex = state.disabled ? -1 : 0;
  el.className = ["am-list-item-button", opts.className].filter(Boolean).join(" ");
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  const applyVisual = (): void => {
    el.style.cssText = buildCss(state);
    applyStyle(el, extraStyle);
    el.setAttribute("aria-selected", String(state.selected));
    if (state.disabled) {
      el.setAttribute("aria-disabled", "true");
      el.tabIndex = -1;
    } else {
      el.removeAttribute("aria-disabled");
      el.tabIndex = 0;
    }
  };
  applyVisual();
  appendContent(el, opts.children);

  let clickHandler = opts.onClick;
  let contextMenuHandler = opts.onContextMenu;

  const onClick = (e: MouseEvent): void => {
    if (state.disabled) return;
    clickHandler?.(e);
  };
  const onContextMenu = (e: MouseEvent): void => {
    contextMenuHandler?.(e);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (state.disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      clickHandler?.(new MouseEvent("click"));
    }
  };

  el.addEventListener("click", onClick);
  el.addEventListener("contextmenu", onContextMenu);
  el.addEventListener("keydown", onKeyDown);

  return {
    el,
    update(next: Partial<CreateListItemButtonOptions>): void {
      let visualChanged = false;
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
      if (next.className !== undefined) {
        el.className = ["am-list-item-button", next.className].filter(Boolean).join(" ");
      }
      if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
      if (next.children !== undefined) {
        for (const node of [...el.childNodes]) el.removeChild(node);
        appendContent(el, next.children);
      }
      if (next.onClick !== undefined) clickHandler = next.onClick;
      if (next.onContextMenu !== undefined) contextMenuHandler = next.onContextMenu;
    },
    destroy(): void {
      el.removeEventListener("click", onClick);
      el.removeEventListener("contextmenu", onContextMenu);
      el.removeEventListener("keydown", onKeyDown);
      clickHandler = undefined;
      contextMenuHandler = undefined;
    },
  };
}
