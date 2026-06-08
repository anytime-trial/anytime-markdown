/**
 * spreadsheet-viewer 自前 UI キットのテーマトークン。
 *
 * `themeMode`（light/dark）から CSS カスタムプロパティ（`--sv-color-*`）と
 * グリッド描画用の色オブジェクトを単一ソースで導出する。
 *
 * 色は Anytime Markdown デザインシステム（design.md §2.2 ダーク / §2.3 ライト=水墨画）に準拠する。
 * ダークモードは旧実装（MUI ダークテーマ由来のハードコード値）が既にブランド値と一致しており不変。
 * ライトモードは旧実装の MUI デフォルト（#FFFFFF / #1976D2 / 黒系）から水墨画パレットへ寄せている。
 *
 * 消費先（database-viewer / trail-viewer 等）は host が `--am-color-*` を注入しないため、
 * これらのトークンは UI ルート要素に直接 `style` で適用して自己完結させる（{@link themeCssVars}）。
 */

export type SpreadsheetThemeMode = "light" | "dark";

export interface SpreadsheetPalette {
  /** カード・グリッド面の背景 */
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
  /** 選択背景（汎用 UI） */
  readonly actionSelected: string;
  /** インタラクティブ強調色（リンク・アクティブトグル・選択ヘッダ） */
  readonly primaryMain: string;
  /** primaryMain 上に乗るテキスト色（contained ボタン等） */
  readonly primaryContrast: string;
  /** エラー色 */
  readonly errorMain: string;
  /** グリッドのヘッダ行/列の背景 */
  readonly headerBg: string;
  /** グリッドのセル選択背景（primary 由来のティント） */
  readonly cellSelectedBg: string;
}

const DARK: SpreadsheetPalette = {
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
  headerBg: "rgba(255,255,255,0.08)",
  cellSelectedBg: "rgba(144,202,249,0.16)",
};

const LIGHT: SpreadsheetPalette = {
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
  headerBg: "rgba(31,30,28,0.04)",
  cellSelectedBg: "rgba(61,74,82,0.12)",
};

export function getPalette(isDark: boolean): SpreadsheetPalette {
  return isDark ? DARK : LIGHT;
}

/**
 * UI ルート要素へ適用する CSS カスタムプロパティ。
 * 自前 UI キットの各コンポーネント CSS（{@link injectStyles}）はこれらの変数を参照する。
 */
export function themeCssVars(isDark: boolean): Record<string, string> {
  const p = getPalette(isDark);
  return {
    "--sv-color-bg-paper": p.bgPaper,
    "--sv-color-bg-default": p.bgDefault,
    "--sv-color-text-primary": p.textPrimary,
    "--sv-color-text-secondary": p.textSecondary,
    "--sv-color-divider": p.divider,
    "--sv-color-action-hover": p.actionHover,
    "--sv-color-action-selected": p.actionSelected,
    "--sv-color-primary-main": p.primaryMain,
    "--sv-color-primary-contrast": p.primaryContrast,
    "--sv-color-error-main": p.errorMain,
  };
}

/**
 * テーマトークンを `document.documentElement` に適用する。
 *
 * Menu / Dialog / Tooltip は `document.body` へポータルされるため、UI ルート要素に
 * inline で置いた CSS 変数が届かない。ポータル先まで確実に変数を行き渡らせるために
 * documentElement へ設定する（markdown-viewer の `applyEditorThemeCssVars` と同方針。
 * プレフィックスが `--sv-*` なので `--am-*` とは衝突しない）。
 * SSR / 非 DOM 環境では何もしない。
 */
export function applySpreadsheetThemeVars(isDark: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const vars = themeCssVars(isDark);
  for (const key of Object.keys(vars)) {
    root.style.setProperty(key, vars[key]);
  }
}

/** 旧 `styles.ts` 互換。境界線色を返す。 */
export function getDivider(isDark: boolean): string {
  return getPalette(isDark).divider;
}
