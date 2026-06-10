/**
 * エディタ設定の型と既定値（React 非依存）。
 *
 * vanilla orchestrator（host/vanillaMarkdownEditor）と React hook（useEditorSettings）の
 * 両方が参照する単一ソース。React 結合モジュールに置くと vanilla 依存グラフへ React が
 * 混入するため、ここへ分離している。
 */

export interface EditorSettings {
  lineHeight: number;
  fontSize: number;
  tableWidth: "auto" | "100%";
  editorBg: "white" | "grey";
  lightBgColor: string;    // ライトモード背景色（空文字 = テーマデフォルト）
  lightTextColor: string;  // ライトモード文字色（空文字 = テーマデフォルト）
  darkBgColor: string;     // ダークモード背景色（空文字 = テーマデフォルト）
  darkTextColor: string;   // ダークモード文字色（空文字 = テーマデフォルト）
  spellCheck: boolean;
  paperSize: "off" | "A3" | "A4" | "B4" | "B5";
  paperMargin: number; // mm単位、10-40
  blockAlign: "left" | "center" | "right";
  wordBreak: "normal" | "keep-all";
}

export const DEFAULT_SETTINGS: EditorSettings = {
  lineHeight: 1.6,
  fontSize: 16,
  tableWidth: "auto",
  editorBg: "white",
  lightBgColor: "",
  lightTextColor: "",
  darkBgColor: "",
  darkTextColor: "",
  spellCheck: false,
  paperSize: "off",
  paperMargin: 20,
  blockAlign: "left",
  wordBreak: "keep-all",
};
