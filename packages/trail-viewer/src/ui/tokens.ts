/**
 * trail-viewer 自前 UI キットのテーマトークン。
 *
 * `isDark` から CSS カスタムプロパティ（`--trv-color-*`）を単一ソースで導出する。
 * 値は trail-viewer のブランドパレット（{@link getTokens} = `theme/designTokens`）に準拠し、
 * database-viewer（`--dbv-*`）/ spreadsheet-viewer（`--sv-*`）と同じ「ホスト非依存・自己完結」方針を踏襲する。
 *
 * これらのトークンは `document.documentElement` へ直接適用する（{@link applyTrailUiThemeVars}）。
 * Menu / Tooltip / Dialog は `document.body` へポータルされるため、ポータル先まで変数を行き渡らせるには
 * documentElement に置く必要がある。プレフィックスが `--trv-*` なので他ビューアのトークンと衝突しない。
 */

import { getTokens } from "../theme/designTokens";

/** UI キットが参照する CSS 変数（`--trv-color-*` ＋構造トークン）。 */
export function trailUiCssVars(isDark: boolean): Record<string, string> {
  const { colors } = getTokens(isDark);
  // primary（iceBlue）上に乗せるテキスト色。dark の薄い iceBlue には濃い字、light の濃い iceBlue には白字。
  const primaryContrast = isDark ? "rgba(0,0,0,0.87)" : "#FFFFFF";
  return {
    "--trv-color-bg-paper": colors.charcoal,
    "--trv-color-bg-default": colors.midnightNavy,
    "--trv-color-text-primary": colors.textPrimary,
    "--trv-color-text-secondary": colors.textSecondary,
    "--trv-color-text-disabled": colors.textDisabled,
    "--trv-color-divider": colors.border,
    "--trv-color-action-hover": colors.hoverBg,
    "--trv-color-action-selected": colors.activeBg,
    "--trv-color-section-bg": colors.sectionBg,
    "--trv-color-primary-main": colors.iceBlue,
    "--trv-color-primary-contrast": primaryContrast,
    "--trv-color-primary-bg": colors.iceBlueBg,
    "--trv-color-primary-border": colors.iceBlueBorder,
    "--trv-color-error-main": colors.error,
    "--trv-color-warning-main": colors.warning,
    "--trv-color-info-main": colors.info,
    "--trv-color-success-main": colors.success,
  };
}

/**
 * テーマトークンを `document.documentElement` に適用する。
 * SSR / 非 DOM 環境では何もしない。ホスト（拡張 webview / web-app）の `useEffect` から isDark 変化時に呼ぶ。
 */
export function applyTrailUiThemeVars(isDark: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const vars = trailUiCssVars(isDark);
  for (const key of Object.keys(vars)) {
    root.style.setProperty(key, vars[key]);
  }
}
