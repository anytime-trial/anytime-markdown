/**
 * 脱React の vanilla DOM ファクトリ — Paper（MUI Paper / `ui/Paper.tsx` 置換）。
 *
 * `Paper.module.css` の `.root`（背景 `--am-color-bg-paper` / 文字 `--am-color-text-primary`）
 * と `.outlined`（`--am-color-divider` の 1px ボーダー）を素 DOM で再現する。React / MUI に
 * 依存せず、テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従する。
 * `chrome/vanillaToolbar.ts` の cssText + CSS 変数パターンに従う。
 *
 * React 原版は影を呼び元の `style` で付与する設計だが、vanilla 版では `elevation` レベル
 * （1〜3）を受けて `box-shadow:var(--am-elevation-N)` を cssText に含める（Dialog.ts と同じ
 * CSS 変数経由）。`variant="outlined"` 時は影を付けない（MUI Paper の挙動に一致）。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

export type PaperVariant = "elevation" | "outlined";

/** elevation レベル（影の強さ）。`--am-elevation-{1,2,3}` に対応。 */
export type PaperElevation = 0 | 1 | 2 | 3;

/** createPaper のオプション。`ui/Paper.tsx` の PaperProps に対応。 */
export interface CreatePaperOptions {
  /** elevation（影）か outlined（枠線）か。既定 "elevation"。 */
  variant?: PaperVariant;
  /**
   * 影の強さ（`variant="elevation"` 時のみ有効）。`--am-elevation-{level}` を box-shadow に使う。
   * 0 は影なし。既定 0（React 原版同様、呼び元が必要時に付与する想定の互換デフォルト）。
   */
  elevation?: PaperElevation;
  /** 中身（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加クラス名（外部スタイルとの結合用）。 */
  className?: string;
  /** 追加スタイル（背景色上書き・余白等）。cssText の後に Object.assign で上書き。 */
  style?: Partial<CSSStyleDeclaration>;
  /** data-testid 属性。 */
  testId?: string;
  /** role 属性（region 等を付けたい場合）。 */
  role?: string;
  /** aria-label。 */
  ariaLabel?: string;
}

/**
 * variant / elevation から cssText を組み立てる。
 * `.root`（背景・文字）に加え、outlined は枠線、elevation は box-shadow を付与する。
 */
function buildCssText(variant: PaperVariant, elevation: PaperElevation): string {
  // .root 相当（Paper.module.css）。
  let css = "background-color:var(--am-color-bg-paper);color:var(--am-color-text-primary);";
  if (variant === "outlined") {
    // .outlined 相当（影なし）。
    css += "border:1px solid var(--am-color-divider);";
  } else if (elevation > 0) {
    // elevation の影は CSS 変数経由（Dialog / floating と同じ --am-elevation-*）。
    css += `box-shadow:var(--am-elevation-${elevation});`;
  }
  return css;
}

/**
 * Paper（`<div>` コンテナ）を生成する。
 *
 * static content かつイベント登録なしのため update / destroy は提供しない
 * （規約: static content / no event → 不要）。variant 切り替え等の動的要件が出た場合は
 * 呼び元で再生成するか `el.style.cssText` を直接操作する。
 */
export function createPaper(opts: CreatePaperOptions = {}): { el: HTMLDivElement } {
  const variant: PaperVariant = opts.variant ?? "elevation";
  const elevation: PaperElevation = opts.elevation ?? 0;

  const el = document.createElement("div");
  el.style.cssText = buildCssText(variant, elevation);
  el.setAttribute("data-variant", variant);
  if (variant === "elevation") {
    el.setAttribute("data-elevation", String(elevation));
  }

  if (opts.role) el.setAttribute("role", opts.role);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  if (opts.className) el.className = opts.className;

  // style は cssText の後（cssText が上書きされないよう Object.assign）。
  applyStyle(el, opts.style);

  appendContent(el, opts.children);

  return { el };
}
