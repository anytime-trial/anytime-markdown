// jest 専用の軽量 barrel shim。
//
// markdown-rich のソースは @anytime-markdown/markdown-viewer (= core の index.ts) から
// 共有部品を import する。だが core の index.ts は MarkdownEditorPage / templates(.md) など
// 重量ツリーを eager にロードするため、rich の単体テストで barrel をそのまま読み込むと
// .md トランスフォーマ未設定や巨大依存で破綻する (core 自身のテストも full barrel は読まない)。
//
// そこで rich jest では moduleNameMapper で barrel をこの shim に差し替え、rich が実際に使う
// 葉モジュールだけを core サブパスから再 export する。tsconfig / next build は本物の barrel を使う。
// (plan: 20260530-markdown-rich-split-design, B-3+B-4)

export {
  findCodeBlockByIndex,
  findCounterpartCode,
  getCodeBlockIndex,
  getMergeEditors,
} from "../../markdown-viewer/src/contexts/MergeEditorsContext";

export { createMarkdownT } from "../../markdown-viewer/src/i18n/createMarkdownT";

export { DEFAULT_SETTINGS } from "../../markdown-viewer/src/editorSettings";
export type { EditorSettings } from "../../markdown-viewer/src/editorSettings";

export {
  CAPTURE_BG,
  DEFAULT_DARK_BG,
  DEFAULT_DARK_CODE_BG,
  DEFAULT_LIGHT_BG,
  DEFAULT_LIGHT_CODE_BG,
  getActionHover,
  getDivider,
  getEditorBg,
  getErrorMain,
  getPrimaryMain,
  getSuccessMain,
  getTextDisabled,
  getTextPrimary,
  getTextSecondary,
  HLJS_DARK,
  HLJS_LIGHT,
} from "../../markdown-viewer/src/constants/colors";

export {
  CHIP_FONT_SIZE,
  FS_CHIP_HEIGHT,
  FS_CODE_INITIAL_WIDTH,
  FS_CODE_MIN_WIDTH,
  FS_PANEL_HEADER_FONT_SIZE,
  FS_TAB_FONT_SIZE,
  FS_TOOLBAR_HEIGHT,
  FS_ZOOM_LABEL_WIDTH,
  MENU_ITEM_FONT_SIZE,
  PREVIEW_MAX_HEIGHT,
  SMALL_CAPTION_FONT_SIZE,
} from "../../markdown-viewer/src/constants/dimensions";

export {
  MATH_SAMPLES,
  MERMAID_SAMPLES,
  PLANTUML_SAMPLES,
} from "../../markdown-viewer/src/constants/samples";

export { FETCH_TIMEOUT } from "../../markdown-viewer/src/constants/timing";

export {
  DURATION_FAST,
  getSplitterSx,
  REDUCED_MOTION_SX,
} from "../../markdown-viewer/src/constants/uiPatterns";

export { getHljsCssVars, getHljsStyles } from "../../markdown-viewer/src/styles/codeStyles";

// 注: `appLowlight` は意図的に再 export しない。唯一の利用者 RichMarkdownEditorPage は
// どのテストからもロードされず、ここで export すると ESM の lowlight が全テストに
// eager ロードされて transform エラーになる。実 barrel (core index.ts) には存在する。

export { saveBlob } from "../../markdown-viewer/src/utils/clipboardHelpers";
export { buildColorRuns } from "../../markdown-viewer/src/utils/colorRuns";
export { applyMerge, computeDiff } from "../../markdown-viewer/src/utils/diffEngine";
export type { DiffLine } from "../../markdown-viewer/src/utils/diffEngine";
export {
  buildPlantUmlUrl,
  PLANTUML_CONSENT_KEY,
  PLANTUML_DARK_SKINPARAMS,
  PLANTUML_LIGHT_SKINPARAMS,
} from "../../markdown-viewer/src/utils/plantumlHelpers";
export {
  EMBED_DATA_ATTR,
  installEmbedFenceRenderer,
} from "../../markdown-viewer/src/utils/embedFenceRenderer";
export type { MarkdownItLike } from "../../markdown-viewer/src/utils/embedFenceRenderer";
export {
  buildEmbedInfoString,
  DEFAULT_EMBED_BASELINE,
  parseEmbedInfoString,
} from "../../markdown-viewer/src/utils/embedInfoString";
export type {
  EmbedBaseline,
  EmbedVariant,
} from "../../markdown-viewer/src/utils/embedInfoString";

export { EmbedNodeView } from "../../markdown-viewer/src/components/EmbedNodeView";

// Phase3b（脱 @mui）: InlineAlert / DiagramBlock 等が使う追加 color helper。
export {
  getErrorBg,
  getInfoBg,
  getInfoMain,
  getSuccessBg,
  getWarningBg,
  getWarningMain,
} from "../../markdown-viewer/src/constants/colors";

// Phase3b（脱 @mui）: useTheme 置換用テーマ context。
export type { ThemeMode } from "../../markdown-viewer/src/contexts/ThemeModeContext";
export { ThemeModeProvider, useIsDark, useThemeMode } from "../../markdown-viewer/src/contexts/ThemeModeContext";
