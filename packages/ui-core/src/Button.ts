/**
 * 脱React の vanilla DOM Button ファクトリ（Phase 3 / ホスト隔離）。
 *
 * 既存 React 実装 `ui/Button.tsx`（+ `Button.module.css`）の見た目・API を素 DOM で再現する。
 * text / outlined / contained × primary / error / inherit × small / medium をサポートし、
 * テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従する。
 * React hook（useIsDark 等）には依存しない。`vanillaToolbar.ts` の cssText + addEventListener
 * パターンに揃える。
 */

import { appendContent, type VanillaContent } from "./dom";

export type ButtonVariant = "text" | "outlined" | "contained";
export type ButtonColor = "primary" | "error" | "inherit";
export type ButtonSize = "small" | "medium";

/** vanilla Button のオプション。React `ButtonProps` のうち vanilla で再現する範囲。 */
export interface CreateButtonOptions {
  /** ボタン内のテキスト。children と併用する場合は startIcon → label の順に並ぶ。 */
  label?: string;
  /** 任意のコンテンツ。string は span、Node はそのまま、配列は順に追加する。 */
  children?: VanillaContent;
  /** 先頭アイコン（label / children の前に配置）。 */
  startIcon?: Node;
  variant?: ButtonVariant;
  color?: ButtonColor;
  size?: ButtonSize;
  disabled?: boolean;
  /** aria-label（アイコンのみボタン等）。 */
  ariaLabel?: string;
  /** title 属性（ツールチップ）。 */
  title?: string;
  /** button type 属性（既定 "button"）。 */
  buttonType?: "button" | "submit" | "reset";
  /** 追加クラス名（外部スタイルとの結合用）。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** クリックハンドラ。 */
  onClick?: () => void;
}

const BASE_CSS =
  "display:inline-flex;align-items:center;justify-content:center;" +
  "gap:var(--am-space-1);box-sizing:border-box;" +
  "border:1px solid transparent;border-radius:var(--am-radius-md);" +
  "font:inherit;font-weight:600;text-transform:none;cursor:pointer;" +
  "user-select:none;" +
  "transition:background-color var(--am-duration-fast) var(--am-ease-standard)," +
  "border-color var(--am-duration-fast) var(--am-ease-standard);";

const SIZE_CSS: Record<ButtonSize, string> = {
  small: "font-size:12px;min-height:26px;padding:0 12px;",
  medium: "font-size:0.875rem;min-height:32px;padding:0 16px;",
};

/**
 * variant / color から背景・枠線・文字色の cssText 断片を返す。
 * Button.module.css の variant/color クラスと一字一句対応させる。
 */
function variantColorCss(variant: ButtonVariant, color: ButtonColor): string {
  if (variant === "contained") {
    if (color === "error") {
      return "border-color:transparent;background:var(--am-color-error-main);color:#fff;";
    }
    return (
      "border-color:transparent;background:var(--am-color-primary-main);" +
      "color:var(--am-color-primary-contrast);"
    );
  }
  if (variant === "outlined") {
    // inherit と primary は同じ text-primary 色（error のみ別）。
    const c =
      color === "error"
        ? "color:var(--am-color-error-main);"
        : "color:var(--am-color-text-primary);";
    return (
      "background:transparent;border-color:var(--am-color-divider);" + c
    );
  }
  // text variant
  if (color === "error") {
    return "background:transparent;color:var(--am-color-error-main);";
  }
  if (color === "inherit") {
    return "background:transparent;color:var(--am-color-text-primary);";
  }
  return "background:transparent;color:var(--am-color-primary-main);";
}

/**
 * vanilla Button を生成する。
 *
 * @returns `el`（button 要素）と `update`（可変プロパティ反映）/ `destroy`（listener 削除）。
 */
export function createButton(opts: CreateButtonOptions = {}): {
  el: HTMLButtonElement;
  update: (next: Partial<CreateButtonOptions>) => void;
  destroy: () => void;
} {
  const variant: ButtonVariant = opts.variant ?? "text";
  const color: ButtonColor = opts.color ?? "primary";
  const size: ButtonSize = opts.size ?? "medium";

  const el = document.createElement("button");
  el.type = opts.buttonType ?? "button";

  const applyVariant = (v: ButtonVariant, c: ButtonColor, s: ButtonSize) => {
    el.style.cssText = BASE_CSS + SIZE_CSS[s] + variantColorCss(v, c);
  };
  applyVariant(variant, color, size);
  el.setAttribute("data-variant", variant);
  el.setAttribute("data-color", color);
  el.setAttribute("data-size", size);

  if (opts.className) el.className = opts.className;
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.title) el.title = opts.title;
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  if (opts.disabled) el.disabled = true;

  // 先頭アイコン → label/children の順（React 実装 startIcon→children に一致）。
  if (opts.startIcon) el.appendChild(opts.startIcon);
  if (opts.label !== undefined && opts.label !== "") {
    const span = document.createElement("span");
    span.textContent = opts.label;
    el.appendChild(span);
  }
  if (opts.children) appendContent(el, opts.children);

  let clickHandler = opts.onClick;
  if (clickHandler) el.addEventListener("click", clickHandler);

  return {
    el,
    update(next: Partial<CreateButtonOptions>) {
      const v = next.variant ?? (el.getAttribute("data-variant") as ButtonVariant);
      const c = next.color ?? (el.getAttribute("data-color") as ButtonColor);
      const s = next.size ?? (el.getAttribute("data-size") as ButtonSize);
      if (
        next.variant !== undefined ||
        next.color !== undefined ||
        next.size !== undefined
      ) {
        applyVariant(v, c, s);
        el.setAttribute("data-variant", v);
        el.setAttribute("data-color", c);
        el.setAttribute("data-size", s);
      }
      if (next.disabled !== undefined) el.disabled = next.disabled;
      if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
      if (next.title !== undefined) el.title = next.title;
      if (next.className !== undefined) el.className = next.className;
      if (next.label !== undefined) {
        // label のみ差し替え（既存テキスト span を再構築）。
        for (const node of [...el.childNodes]) el.removeChild(node);
        if (opts.startIcon) el.appendChild(opts.startIcon);
        const span = document.createElement("span");
        span.textContent = next.label;
        el.appendChild(span);
      }
      if (next.onClick !== undefined) {
        if (clickHandler) el.removeEventListener("click", clickHandler);
        clickHandler = next.onClick;
        if (clickHandler) el.addEventListener("click", clickHandler);
      }
    },
    destroy() {
      if (clickHandler) {
        el.removeEventListener("click", clickHandler);
        clickHandler = undefined;
      }
    },
  };
}
