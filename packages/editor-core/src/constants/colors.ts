import type { EditorSettings } from "../useEditorSettings";

// ── エディタ背景色 ──
export const DEFAULT_DARK_BG = "#0D1117";
export const DEFAULT_LIGHT_BG = "#F8F9FA";

// ── エディタ文字色 ──
export const DEFAULT_DARK_TEXT = "#E2E8F0";
export const DEFAULT_LIGHT_TEXT = "#2D3748";

// ── コードブロック背景色 ──
export const DEFAULT_DARK_CODE_BG = "#161B22";
export const DEFAULT_LIGHT_CODE_BG = "#F1F5F9";

// ── 見出しセクション背景色 ──
export const DEFAULT_DARK_HEADING_BG = "#1A202C";
export const DEFAULT_LIGHT_HEADING_BG = "#EDF2F7";

// ── 見出しリンク色 ──
export const DEFAULT_DARK_HEADING_LINK = "#63B3ED";
export const DEFAULT_LIGHT_HEADING_LINK = "#3182CE";

// ── アクセントカラー（検索ハイライト等） ──
export const ACCENT_COLOR = "#e8a012";
export const ACCENT_COLOR_ALPHA = "rgba(232,160,18,0.35)";

// ── PlantUML skinparam ──
export const PLANTUML_DARK_FG = "#CCCCCC";
export const PLANTUML_DARK_BG = "#2D2D2D";
export const PLANTUML_DARK_SURFACE = "#1E1E1E";

// ── 図キャプチャ Canvas 背景 ──
export const CAPTURE_BG = "#ffffff";

// ── ヘルパー関数 ──

/** ユーザー設定を考慮したエディタ背景色を返す */
export function getEditorBg(isDark: boolean, settings?: Pick<EditorSettings, "darkBgColor" | "lightBgColor">): string {
  return isDark
    ? (settings?.darkBgColor || DEFAULT_DARK_BG)
    : (settings?.lightBgColor || DEFAULT_LIGHT_BG);
}

/** ユーザー設定を考慮したエディタ文字色を返す */
export function getEditorText(isDark: boolean, settings?: Pick<EditorSettings, "darkTextColor" | "lightTextColor">): string {
  return isDark
    ? (settings?.darkTextColor || DEFAULT_DARK_TEXT)
    : (settings?.lightTextColor || DEFAULT_LIGHT_TEXT);
}
