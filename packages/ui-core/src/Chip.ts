/**
 * 脱React の vanilla DOM Chip ファクトリ（MUI Chip / ui/Chip.tsx 置換）。
 *
 * 既存 React 実装 `ui/Chip.tsx`（+ `Chip.module.css`）の見た目・API・a11y を素 DOM で再現する。
 * outlined / filled × small / medium をサポートし、`onClick` 指定でクリック可能（ボタン化）になる。
 * clickable 時は `role="button"` / `tabIndex=0` を付与し、Enter / Space でも `onClick` を発火する。
 * テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従し、React hook
 * （useIsDark 等）には依存しない。`Button.ts` の cssText + addEventListener パターンに揃える。
 */

import { appendContent, type VanillaContent } from "./dom";

export type ChipSize = "small" | "medium";
export type ChipVariant = "outlined" | "filled";

/**
 * clickable Chip の hover / focus-visible pseudo-class を document.head へ 1 度だけ注入する
 * （inline style では擬似クラスを書けないため。IconButton.ts と同方式）。clickable な chip のみ
 * `data-ui-chip-clickable` を持つので、非 clickable chip には適用されない。
 */
const SHARED_STYLE_ID = "am-ui-chip-styles";
function ensureChipStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(SHARED_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SHARED_STYLE_ID;
  // filled variant は inline で background-color を持つため、hover を効かせるには !important が要る。
  style.textContent =
    "[data-ui-chip-clickable]:hover{background-color:var(--am-color-action-hover) !important;}" +
    "[data-ui-chip-clickable]:focus-visible{outline:2px solid var(--am-color-primary-main);outline-offset:1px;}";
  document.head.appendChild(style);
}

/** vanilla Chip のオプション。React `ChipProps` のうち vanilla で再現する範囲。 */
export interface CreateChipOptions {
  /** ラベル。string は span、Node はそのまま、配列は順に追加する。 */
  label?: VanillaContent;
  size?: ChipSize;
  variant?: ChipVariant;
  /** 追加クラス名（外部スタイルとの結合用）。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** クリックハンドラ。指定すると clickable（role=button / tabIndex=0 / Enter・Space 対応）。 */
  onClick?: () => void;
}

// Chip.module.css .chip 相当（pill 形・transparent 背景・text-primary 文字色）。
const BASE_CSS =
  "display:inline-flex;align-items:center;box-sizing:border-box;" +
  "border-radius:16px;font-size:0.8125rem;white-space:nowrap;" +
  "color:var(--am-color-text-primary);background-color:transparent;" +
  "transition:background-color var(--am-duration-fast) var(--am-ease-standard);";

// Chip.module.css .small / .medium 相当。
const SIZE_CSS: Record<ChipSize, string> = {
  small: "height:24px;font-size:0.75rem;",
  medium: "height:32px;",
};

// Chip.module.css .outlined / .filled 相当。
const VARIANT_CSS: Record<ChipVariant, string> = {
  outlined: "border:1px solid var(--am-color-divider);",
  filled: "border:none;background-color:var(--am-color-action-selected);",
};

// Chip.module.css .clickable 相当（cursor のみ。hover / focus-visible は CSS 擬似クラスのため省略）。
const CLICKABLE_CSS = "cursor:pointer;";

/**
 * vanilla Chip を生成する。
 *
 * @returns `el`（div 要素）と `update`（可変プロパティ反映）/ `destroy`（listener 削除）。
 */
export function createChip(opts: CreateChipOptions = {}): {
  el: HTMLDivElement;
  update: (next: Partial<CreateChipOptions>) => void;
  destroy: () => void;
} {
  const size: ChipSize = opts.size ?? "medium";
  const variant: ChipVariant = opts.variant ?? "filled";

  const el = document.createElement("div");

  let clickHandler = opts.onClick;
  const isClickable = (): boolean => clickHandler != null;

  const applyStyleAttrs = (v: ChipVariant, s: ChipSize): void => {
    el.style.cssText =
      BASE_CSS + SIZE_CSS[s] + VARIANT_CSS[v] + (isClickable() ? CLICKABLE_CSS : "");
  };

  const applyClickableA11y = (): void => {
    if (isClickable()) {
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.setAttribute("data-ui-chip-clickable", "");
      ensureChipStyles();
    } else {
      el.removeAttribute("role");
      el.removeAttribute("tabindex");
      el.removeAttribute("data-ui-chip-clickable");
    }
  };

  applyStyleAttrs(variant, size);
  el.setAttribute("data-variant", variant);
  el.setAttribute("data-size", size);
  applyClickableA11y();

  if (opts.className) el.className = opts.className;
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  // label は span（Chip.module.css .label = padding:0 8px;overflow:hidden;text-overflow:ellipsis）。
  const labelSpan = document.createElement("span");
  labelSpan.style.cssText = "padding:0 8px;overflow:hidden;text-overflow:ellipsis;";
  appendContent(labelSpan, opts.label);
  el.appendChild(labelSpan);

  // Enter / Space で onClick を発火する（React 実装 handleKeyDown と一致）。
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!isClickable()) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      clickHandler?.();
    }
  };

  if (clickHandler) el.addEventListener("click", clickHandler);
  el.addEventListener("keydown", onKeyDown);

  return {
    el,
    update(next: Partial<CreateChipOptions>) {
      const v = next.variant ?? (el.getAttribute("data-variant") as ChipVariant);
      const s = next.size ?? (el.getAttribute("data-size") as ChipSize);

      // onClick の差し替え（clickable 状態が変わるので style / a11y より先に確定する）。
      if (next.onClick !== undefined) {
        if (clickHandler) el.removeEventListener("click", clickHandler);
        clickHandler = next.onClick;
        if (clickHandler) el.addEventListener("click", clickHandler);
      }

      if (
        next.variant !== undefined ||
        next.size !== undefined ||
        next.onClick !== undefined
      ) {
        applyStyleAttrs(v, s);
        el.setAttribute("data-variant", v);
        el.setAttribute("data-size", s);
      }
      if (next.onClick !== undefined) applyClickableA11y();
      if (next.className !== undefined) el.className = next.className;
      if (next.label !== undefined) {
        for (const node of [...labelSpan.childNodes]) labelSpan.removeChild(node);
        appendContent(labelSpan, next.label);
      }
    },
    destroy() {
      if (clickHandler) {
        el.removeEventListener("click", clickHandler);
        clickHandler = undefined;
      }
      el.removeEventListener("keydown", onKeyDown);
    },
  };
}
