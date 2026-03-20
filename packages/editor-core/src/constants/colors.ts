import type { EditorSettings } from "../useEditorSettings";

// ── エディタ背景色 ──
export const DEFAULT_DARK_BG = "#0D1117";
export const DEFAULT_LIGHT_BG = "#F8F9FA";

// ── エディタ文字色 ──
export const DEFAULT_DARK_TEXT = "#E2E8F0";
export const DEFAULT_LIGHT_TEXT = "#2D3748";

// ── UI テキスト色（MUI テーマ準拠） ──
export const DARK_TEXT_PRIMARY = "#ffffffde";
export const DARK_TEXT_SECONDARY = "#ffffff99";
export const DARK_TEXT_DISABLED = "#ffffff61";
export const LIGHT_TEXT_PRIMARY = "#000000de";
export const LIGHT_TEXT_SECONDARY = "#00000099";
export const LIGHT_TEXT_DISABLED = "#00000061";

// ── コードブロック背景色 ──
export const DEFAULT_DARK_CODE_BG = "#161B22";
export const DEFAULT_LIGHT_CODE_BG = "#F1F5F9";

// ── 見出しセクション背景色 ──
export const DEFAULT_DARK_HEADING_BG = "#1A202C";
export const DEFAULT_LIGHT_HEADING_BG = "#EDF2F7";

// ── 見出しリンク色 ──
export const DEFAULT_DARK_HEADING_LINK = "#63B3ED";
export const DEFAULT_LIGHT_HEADING_LINK = "#3182CE";

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
