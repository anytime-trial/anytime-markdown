/**
 * 脱React の vanilla DOM IconButton ファクトリ（Phase 3 / ホスト隔離）。
 *
 * React 実装 `ui/IconButton.tsx`（MUI IconButton 置換）の素 DOM 版。円形・hover 背景・
 * focus リング・サイズ別パディングを CSS 変数（`--am-color-*` / applyEditorThemeCssVars 注入）
 * で再現し、useIsDark 等の React テーマ API に依存しない。
 *
 * `chrome/vanillaToolbar.ts` のパターン（cssText + CSS 変数 + addEventListener）に従う。
 * SVG アイコンは `svgIcon()` ヘルパを利用して inline 埋め込みできる。
 */

/** IconButton のサイズ。パディングでサイズが決まる（アイコン寸法は children 側が決定）。 */
export type IconButtonSize = "xs" | "compact" | "small" | "medium";

/** サイズ別パディング（ui/IconButton.module.css と一致）。 */
const SIZE_PADDING: Record<IconButtonSize, string> = {
  xs: "2px",
  compact: "4px",
  small: "5px",
  medium: "8px",
};

const TRANSITION =
  "background-color var(--am-duration-fast) var(--am-ease-standard)";

/** 円形 IconButton のオプション。 */
export interface CreateIconButtonOptions {
  /** パディングでサイズが決まる。既定 medium。 */
  size?: IconButtonSize;
  /** a11y ラベル（aria-label）。 */
  ariaLabel?: string;
  /** ネイティブ title（ツールチップ）。 */
  title?: string;
  /** 無効状態。 */
  disabled?: boolean;
  /** ボタンの type。既定 "button"。 */
  type?: "button" | "submit" | "reset";
  /** 追加クラス名。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 中身。string は span でラップ、Node はそのまま追加、配列は順に追加。 */
  children?: string | Node | readonly (string | Node)[];
  /** クリックハンドラ。 */
  onClick?: (e: MouseEvent) => void;
}

interface ListenerEntry {
  type: string;
  handler: EventListener;
  options?: AddEventListenerOptions | boolean;
}

/** IconButton ファクトリの戻り値。 */
export interface IconButtonHandle {
  /** root の `<button>` 要素。 */
  el: HTMLButtonElement;
  /** 可変プロパティ（disabled / ariaLabel / title / size / children）の更新。 */
  update: (opts: Partial<CreateIconButtonOptions>) => void;
  /** event listener 削除・children クリア。 */
  destroy: () => void;
}

function appendChildren(
  el: HTMLElement,
  children: string | Node | readonly (string | Node)[],
): void {
  const list = Array.isArray(children)
    ? children
    : [children as string | Node];
  for (const child of list) {
    if (typeof child === "string") {
      const span = document.createElement("span");
      span.textContent = child;
      el.appendChild(span);
    } else {
      el.appendChild(child as Node);
    }
  }
}

function applySize(el: HTMLButtonElement, size: IconButtonSize): void {
  el.style.padding = SIZE_PADDING[size];
}

/**
 * MUI IconButton の置換（vanilla）。円形・hover 背景・focus リングを再現。
 * color は currentColor を継承（呼び元で `handle.el.style.color` 上書き可）。
 */
export function createIconButton(
  opts: CreateIconButtonOptions = {},
): IconButtonHandle {
  const el = document.createElement("button");
  const size: IconButtonSize = opts.size ?? "medium";
  const type = opts.type ?? "button";

  el.type = type;
  el.dataset.uiIconButton = "";

  // 基本スタイル（ui/IconButton.module.css 相当）。hover / focus-visible / disabled は
  // CSS 変数を参照する一つの <style> ルールで表現する（pseudo-class は cssText 不可のため）。
  el.style.cssText =
    "display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" +
    "border:none;border-radius:50%;background:transparent;color:inherit;cursor:pointer;" +
    `transition:${TRANSITION};`;
  applySize(el, size);

  if (opts.className) el.className = opts.className;
  if (opts.ariaLabel !== undefined) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.title !== undefined) el.title = opts.title;
  if (opts.testId !== undefined) el.setAttribute("data-testid", opts.testId);
  if (opts.disabled) el.disabled = true;
  if (opts.children !== undefined) appendChildren(el, opts.children);

  // hover / focus-visible / disabled の見た目を CSS 変数で再現する。
  // pseudo-class は inline style で書けないため、ボタン自身に紐づく <style> を注入する。
  const styleEl = document.createElement("style");
  const scopeAttr = "data-ui-icon-button-scope";
  const scopeId = `am-iconbtn-${Math.random().toString(36).slice(2)}`;
  el.setAttribute(scopeAttr, scopeId);
  styleEl.textContent =
    `button[${scopeAttr}="${scopeId}"]:hover:not(:disabled){background:var(--am-color-action-hover);}` +
    `button[${scopeAttr}="${scopeId}"]:disabled{opacity:0.5;cursor:default;}` +
    `button[${scopeAttr}="${scopeId}"]:focus-visible{outline:2px solid var(--am-color-primary-main);outline-offset:1px;}`;
  el.appendChild(styleEl);

  const listeners: ListenerEntry[] = [];
  function on(
    eventType: string,
    handler: EventListener,
    options?: AddEventListenerOptions | boolean,
  ): void {
    el.addEventListener(eventType, handler, options);
    listeners.push({ type: eventType, handler, options });
  }

  if (opts.onClick) {
    on("click", opts.onClick as EventListener);
  }

  function update(next: Partial<CreateIconButtonOptions>): void {
    if (next.disabled !== undefined) el.disabled = next.disabled;
    if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
    if (next.title !== undefined) el.title = next.title;
    if (next.size !== undefined) applySize(el, next.size);
    if (next.className !== undefined) {
      el.className = next.className;
      el.setAttribute(scopeAttr, scopeId);
    }
    if (next.children !== undefined) {
      // 既存 children（style 要素を除く）を除去して入れ替える。
      for (const node of [...el.childNodes]) {
        if (node !== styleEl) el.removeChild(node);
      }
      appendChildren(el, next.children);
    }
  }

  function destroy(): void {
    for (const { type: t, handler, options } of listeners) {
      el.removeEventListener(t, handler, options);
    }
    listeners.length = 0;
    styleEl.remove();
  }

  return { el, update, destroy };
}
