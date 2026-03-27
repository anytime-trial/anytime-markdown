import type { EditorSettings } from "../useEditorSettings";

// ── エディタ背景色 ──
export const DEFAULT_DARK_BG = "#0D1117";
export const DEFAULT_LIGHT_BG = "#E8E6E1";

// ── エディタ文字色 ──
export const DEFAULT_DARK_TEXT = "#E2E8F0";
export const DEFAULT_LIGHT_TEXT = "#111827";

// ── UI テキスト色（MUI テーマ準拠） ──
export const DARK_TEXT_PRIMARY = "#ffffffde";
export const DARK_TEXT_SECONDARY = "#ffffff99";
export const DARK_TEXT_DISABLED = "#ffffff73";
export const LIGHT_TEXT_PRIMARY = "#000000de";
export const LIGHT_TEXT_SECONDARY = "#00000099";
export const LIGHT_TEXT_DISABLED = "#00000061";

// ── コードブロック背景色 ──
export const DEFAULT_DARK_CODE_BG = "#161B22";
export const DEFAULT_LIGHT_CODE_BG = "#F5F5F0";

// ── 見出しセクション背景色 ──
export const DEFAULT_DARK_HEADING_BG = "#1A202C";
export const DEFAULT_LIGHT_HEADING_BG = "#DDDCD8";

// ── 見出しリンク色 ──
export const DEFAULT_DARK_HEADING_LINK = "#63B3ED";
export const DEFAULT_LIGHT_HEADING_LINK = "#1A1A1A";

// ── 見出し装飾色（ボーダー・背景グラデーション） ──
export const DEFAULT_DARK_H1_BORDER = "rgba(99,179,237,0.12)";
export const DEFAULT_DARK_H2_BORDER = "rgba(99,179,237,0.6)";
export const DEFAULT_DARK_H3_BORDER = "rgba(99,179,237,0.35)";
export const DEFAULT_DARK_H1_GRADIENT = "rgba(99,179,237,0.12)";
export const DEFAULT_DARK_H2_GRADIENT = "rgba(99,179,237,0.08)";
export const DEFAULT_LIGHT_H1_BORDER = "rgba(0,0,0,0.06)";
export const DEFAULT_LIGHT_H2_BORDER = "rgba(0,0,0,0.25)";
export const DEFAULT_LIGHT_H3_BORDER = "rgba(0,0,0,0.15)";
export const DEFAULT_LIGHT_H1_GRADIENT = "rgba(0,0,0,0.06)";
export const DEFAULT_LIGHT_H2_GRADIENT = "rgba(0,0,0,0.04)";

// ── シンタックスハイライト色（GitHub テーマ準拠） ──
export const HLJS_DARK = {
  keyword: "#ff7b72",
  string: "#a5d6ff",
  comment: "#8b949e",
  number: "#79c0ff",
  title: "#d2a8ff",
  params: "#c9d1d9",
  meta: "#ffa657",
  addition: "#aff5b4",
  additionBg: "rgba(46,160,67,0.15)",
  deletion: "#ffdcd7",
  deletionBg: "rgba(248,81,73,0.15)",
} as const;

export const HLJS_LIGHT = {
  keyword: "#cf222e",
  string: "#0a3069",
  comment: "#6e7781",
  number: "#0550ae",
  title: "#8250df",
  params: "#24292f",
  meta: "#953800",
  addition: "#116329",
  additionBg: "rgba(46,160,67,0.15)",
  deletion: "#82071e",
  deletionBg: "rgba(248,81,73,0.15)",
} as const;

// ── テーブルセル背景色 ──
export const DEFAULT_DARK_TABLE_CELL_BG = "#161B22";
export const DEFAULT_LIGHT_TABLE_CELL_BG = "#E8E6E1";
export const DEFAULT_DARK_TABLE_HEADER_BG = "#1A202C";
export const DEFAULT_LIGHT_TABLE_HEADER_BG = "#DDDCD8";

// ── インラインコード色 ──
export const DEFAULT_DARK_INLINE_CODE = undefined; // getGrey で動的取得
export const DEFAULT_LIGHT_INLINE_CODE = "#c62828";

// ── Admonition（GitHub 準拠） ──
export const ADMONITION_NOTE = "#1f6feb";
export const ADMONITION_TIP = "#238636";
export const ADMONITION_IMPORTANT = "#8957e5";
export const ADMONITION_WARNING = "#d29922";
export const ADMONITION_CAUTION = "#da3633";

// ── アクセントカラー（検索ハイライト等） ──
export const ACCENT_COLOR = "#e8a012";
export const ACCENT_COLOR_ALPHA = "rgba(232,160,18,0.35)";

// ── PlantUML skinparam ──
export const PLANTUML_DARK_FG = "#CCCCCC";
export const PLANTUML_DARK_BG = "#2D2D2D";
export const PLANTUML_DARK_SURFACE = "#1E1E1E";
export const PLANTUML_LIGHT_FG = "#1A1A1A";
export const PLANTUML_LIGHT_BG = "#F5F5F0";
export const PLANTUML_LIGHT_SURFACE = "#EAEAE5";
export const PLANTUML_LIGHT_BORDER = "#888888";

// ── 図キャプチャ Canvas 背景 ──
export const CAPTURE_BG = "#ffffff";

// ── ファイルドラッグオーバー ──
export const FILE_DROP_OVERLAY_COLOR = "rgba(66, 133, 244, 0.15)";

// ── ヘルパー関数 ──

/** ユーザー設定を考慮したエディタ背景色を返す */
export function getEditorBg(isDark: boolean, settings?: Pick<EditorSettings, "darkBgColor" | "lightBgColor">): string {
  return isDark
    ? (settings?.darkBgColor || DEFAULT_DARK_BG)
    : (settings?.lightBgColor || DEFAULT_LIGHT_BG);
}

/** ブロック要素編集ダイアログの Paper 背景色を返す */
export function getEditDialogBg(isDark: boolean, settings?: Pick<EditorSettings, "editorBg">): string | undefined {
  return settings?.editorBg === "grey" && !isDark ? "grey.50" : undefined;
}

/** ユーザー設定を考慮したエディタ文字色を返す */
export function getEditorText(isDark: boolean, settings?: Pick<EditorSettings, "darkTextColor" | "lightTextColor">): string {
  return isDark
    ? (settings?.darkTextColor || DEFAULT_DARK_TEXT)
    : (settings?.lightTextColor || DEFAULT_LIGHT_TEXT);
}

/** ダーク/ライトモードに応じた UI テキスト色を返すヘルパー */
export function getTextPrimary(isDark: boolean): string {
  return isDark ? DARK_TEXT_PRIMARY : LIGHT_TEXT_PRIMARY;
}
export function getTextSecondary(isDark: boolean): string {
  return isDark ? DARK_TEXT_SECONDARY : LIGHT_TEXT_SECONDARY;
}
export function getTextDisabled(isDark: boolean): string {
  return isDark ? DARK_TEXT_DISABLED : LIGHT_TEXT_DISABLED;
}

// ── UI 背景色（MUI テーマ準拠） ──
export const DARK_BG_PAPER = "#121212";
export const LIGHT_BG_PAPER = "#fff";
export const DARK_ACTION_HOVER = "rgba(255,255,255,0.08)";
export const LIGHT_ACTION_HOVER = "rgba(0,0,0,0.04)";
export const DARK_ACTION_SELECTED = "rgba(255,255,255,0.16)";
export const LIGHT_ACTION_SELECTED = "rgba(0,0,0,0.08)";
export const DARK_DIVIDER = "rgba(255,255,255,0.12)";
export const LIGHT_DIVIDER = "rgba(0,0,0,0.12)";

/** ダーク/ライトモードに応じた UI 背景色を返すヘルパー */
export function getBgPaper(isDark: boolean): string {
  return isDark ? DARK_BG_PAPER : LIGHT_BG_PAPER;
}
export function getActionHover(isDark: boolean): string {
  return isDark ? DARK_ACTION_HOVER : LIGHT_ACTION_HOVER;
}
export function getActionSelected(isDark: boolean): string {
  return isDark ? DARK_ACTION_SELECTED : LIGHT_ACTION_SELECTED;
}
export function getDivider(isDark: boolean): string {
  return isDark ? DARK_DIVIDER : LIGHT_DIVIDER;
}

// ── UI アクセント色（MUI テーマ準拠） ──
export const DARK_PRIMARY_MAIN = "#90caf9";
export const DARK_PRIMARY_DARK = "#42a5f5";
export const DARK_PRIMARY_LIGHT = "#e3f2fd";
export const DARK_PRIMARY_CONTRAST = "rgba(0,0,0,0.87)";
export const LIGHT_PRIMARY_MAIN = "#1976d2";
export const LIGHT_PRIMARY_DARK = "#1565c0";
export const LIGHT_PRIMARY_LIGHT = "#42a5f5";
export const LIGHT_PRIMARY_CONTRAST = "#fff";

export const DARK_ERROR_MAIN = "#f44336";
export const LIGHT_ERROR_MAIN = "#d32f2f";

export const DARK_WARNING_MAIN = "#ffa726";
export const DARK_WARNING_LIGHT = "#ffb74d";
export const LIGHT_WARNING_MAIN = "#ed6c02";
export const LIGHT_WARNING_LIGHT = "#ff9800";

export const DARK_SUCCESS_MAIN = "#66bb6a";
export const LIGHT_SUCCESS_MAIN = "#2e7d32";

// ── セマンティックカラー背景（alpha） ──
export const DARK_ERROR_BG = "rgba(239,83,80,0.12)";
export const DARK_WARNING_BG = "rgba(255,167,38,0.12)";
export const DARK_SUCCESS_BG = "rgba(102,187,106,0.12)";
export const DARK_INFO_MAIN = "#42a5f5";
export const DARK_INFO_BG = "rgba(66,165,245,0.12)";
export const LIGHT_ERROR_BG = "rgba(211,47,47,0.08)";
export const LIGHT_WARNING_BG = "rgba(237,108,2,0.08)";
export const LIGHT_SUCCESS_BG = "rgba(46,125,50,0.08)";
export const LIGHT_INFO_MAIN = "#0288d1";
export const LIGHT_INFO_BG = "rgba(2,136,209,0.08)";

export const DARK_GREY_100 = "#f5f5f5";
export const DARK_GREY_300 = "#e0e0e0";
export const DARK_GREY_900 = "#212121";
export const LIGHT_GREY_100 = "#f5f5f5";
export const LIGHT_GREY_300 = "#e0e0e0";
export const LIGHT_GREY_900 = "#212121";

export const COMMON_WHITE = "#fff";

/** ダーク/ライトモードに応じた UI アクセント色を返すヘルパー */
export function getPrimaryMain(isDark: boolean): string {
  return isDark ? DARK_PRIMARY_MAIN : LIGHT_PRIMARY_MAIN;
}
export function getPrimaryDark(isDark: boolean): string {
  return isDark ? DARK_PRIMARY_DARK : LIGHT_PRIMARY_DARK;
}
export function getPrimaryLight(isDark: boolean): string {
  return isDark ? DARK_PRIMARY_LIGHT : LIGHT_PRIMARY_LIGHT;
}
export function getPrimaryContrast(isDark: boolean): string {
  return isDark ? DARK_PRIMARY_CONTRAST : LIGHT_PRIMARY_CONTRAST;
}
export function getErrorMain(isDark: boolean): string {
  return isDark ? DARK_ERROR_MAIN : LIGHT_ERROR_MAIN;
}
export function getWarningMain(isDark: boolean): string {
  return isDark ? DARK_WARNING_MAIN : LIGHT_WARNING_MAIN;
}
export function getWarningLight(isDark: boolean): string {
  return isDark ? DARK_WARNING_LIGHT : LIGHT_WARNING_LIGHT;
}
export function getSuccessMain(isDark: boolean): string {
  return isDark ? DARK_SUCCESS_MAIN : LIGHT_SUCCESS_MAIN;
}
export function getGrey(isDark: boolean, shade: 100 | 300 | 900): string {
  const greys = { 100: "#f5f5f5", 300: "#e0e0e0", 900: "#212121" };
  return greys[shade];
}
export function getInfoMain(isDark: boolean): string {
  return isDark ? DARK_INFO_MAIN : LIGHT_INFO_MAIN;
}
export function getErrorBg(isDark: boolean): string {
  return isDark ? DARK_ERROR_BG : LIGHT_ERROR_BG;
}
export function getWarningBg(isDark: boolean): string {
  return isDark ? DARK_WARNING_BG : LIGHT_WARNING_BG;
}
export function getSuccessBg(isDark: boolean): string {
  return isDark ? DARK_SUCCESS_BG : LIGHT_SUCCESS_BG;
}
export function getInfoBg(isDark: boolean): string {
  return isDark ? DARK_INFO_BG : LIGHT_INFO_BG;
}
