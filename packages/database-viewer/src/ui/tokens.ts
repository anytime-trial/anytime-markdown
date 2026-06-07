/**
 * database-viewer 自前 UI キットのテーマトークン。
 *
 * `@mui/material` のテーマ（`sx` の `"divider"` / `"text.secondary"` 等）への依存を断つため、
 * `themeMode`（light/dark）から CSS カスタムプロパティ（`--dbv-color-*`）を単一ソースで導出する。
 *
 * 色は Anytime Markdown デザインシステム（design.md §2.1 共通 / §2.2 ダーク / §2.3 ライト=水墨画）に準拠する。
 * spreadsheet-viewer の `ui/tokens.ts` と同値（ドリフト防止のため出典を design.md に固定）。
 *
 * database-viewer は host が `--am-color-*` を注入しないため、これらのトークンは
 * `document.documentElement` へ直接適用して自己完結させる（{@link applyDatabaseUiThemeVars}）。
 * Menu / Tooltip は `document.body` へポータルされるため documentElement に置く必要がある。
 * プレフィックスが `--dbv-*` なので spreadsheet-viewer の `--sv-*` とは衝突しない。
 */

export type DatabaseThemeMode = "light" | "dark";

export interface DatabasePalette {
  /** カード・ペーパー面の背景 */
  readonly bgPaper: string;
  /** 一段奥の背景 */
  readonly bgDefault: string;
  /** 本文テキスト */
  readonly textPrimary: string;
  /** 補足テキスト（ヘッダ等） */
  readonly textSecondary: string;
  /** 境界線 */
  readonly divider: string;
  /** ホバー背景 */
  readonly actionHover: string;
  /** 選択背景 */
  readonly actionSelected: string;
  /** インタラクティブ強調色（リンク・選択タブ） */
  readonly primaryMain: string;
  /** primaryMain 上に乗るテキスト色（contained ボタン等） */
  readonly primaryContrast: string;
  /** エラー色 */
  readonly errorMain: string;
  /** 警告色（design.md: dark=紫苑 / light=藍墨） */
  readonly warningMain: string;
  /** 情報色 */
  readonly infoMain: string;
  /** 成功色 */
  readonly successMain: string;
}

const DARK: DatabasePalette = {
  bgPaper: "#121212",
  bgDefault: "#0D1117",
  textPrimary: "rgba(255,255,255,0.87)",
  textSecondary: "rgba(255,255,255,0.60)",
  divider: "rgba(255,255,255,0.12)",
  actionHover: "rgba(255,255,255,0.08)",
  actionSelected: "rgba(255,255,255,0.16)",
  primaryMain: "#90CAF9",
  primaryContrast: "rgba(0,0,0,0.87)",
  errorMain: "#F44336",
  warningMain: "#9B7BD8",
  infoMain: "#42A5F5",
  successMain: "#66BB6A",
};

const LIGHT: DatabasePalette = {
  // 水墨画パレット（design.md §2.3）
  bgPaper: "#FBF9F3",
  bgDefault: "#F2EFE8",
  textPrimary: "#1F1E1C",
  textSecondary: "#5C5A55",
  divider: "rgba(31,30,28,0.12)",
  actionHover: "rgba(31,30,28,0.04)",
  actionSelected: "rgba(31,30,28,0.08)",
  primaryMain: "#3D4A52",
  primaryContrast: "#FBF9F3",
  errorMain: "#6B2A20",
  warningMain: "#4A5A6B",
  infoMain: "#3D4A52",
  successMain: "#4B5A3E",
};

export function getPalette(isDark: boolean): DatabasePalette {
  return isDark ? DARK : LIGHT;
}

/**
 * UI ルートへ適用する CSS カスタムプロパティ。
 * 自前 UI キットの各コンポーネント CSS（{@link injectDatabaseUiStyles}）はこれらの変数を参照する。
 */
export function themeCssVars(isDark: boolean): Record<string, string> {
  const p = getPalette(isDark);
  return {
    "--dbv-color-bg-paper": p.bgPaper,
    "--dbv-color-bg-default": p.bgDefault,
    "--dbv-color-text-primary": p.textPrimary,
    "--dbv-color-text-secondary": p.textSecondary,
    "--dbv-color-divider": p.divider,
    "--dbv-color-action-hover": p.actionHover,
    "--dbv-color-action-selected": p.actionSelected,
    "--dbv-color-primary-main": p.primaryMain,
    "--dbv-color-primary-contrast": p.primaryContrast,
    "--dbv-color-error-main": p.errorMain,
    "--dbv-color-warning-main": p.warningMain,
    "--dbv-color-info-main": p.infoMain,
    "--dbv-color-success-main": p.successMain,
  };
}

/**
 * テーマトークンを `document.documentElement` に適用する。
 *
 * Menu / Tooltip は `document.body` へポータルされるため、ポータル先まで確実に変数を
 * 行き渡らせるために documentElement へ設定する。SSR / 非 DOM 環境では何もしない。
 */
export function applyDatabaseUiThemeVars(isDark: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const vars = themeCssVars(isDark);
  for (const key of Object.keys(vars)) {
    root.style.setProperty(key, vars[key]);
  }
}

/** 境界線色を返す。 */
export function getDivider(isDark: boolean): string {
  return getPalette(isDark).divider;
}
