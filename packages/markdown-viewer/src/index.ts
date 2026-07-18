// i18n（React 非依存 translator。React Provider/useMarkdownT は markdown-react-islands へ移設）
export { createMarkdownT } from './i18n/createMarkdownT';

// 脱React G3: vanilla orchestrator（React ラッパ VanillaMarkdownEditorMount は
// markdown-react-islands へ移設。consumer はそちらを import する）
export {
  mountVanillaMarkdownEditor,
  type MountVanillaMarkdownEditorOptions,
  type VanillaMarkdownEditorHandle,
  type VanillaMarkdownEditorUpdatePatch,
} from './host/vanillaMarkdownEditor';
// live patch の差分計算（冪等でない sink の不要発火を source 側で防ぐ）
export { diffLivePatch } from './host/liveUpdateDiff';

// Editor settings（React 非依存の単一ソース）
export type { EditorSettings } from './editorSettings';
export { DEFAULT_SETTINGS } from './editorSettings';
// Vanilla chrome primitives（脱React・Phase3 ホスト隔離）。他 viewer（rich 等）が共有する。
export type { SelectedBlockSnapshot, BlockChromeAnchorHandle } from './chrome/blockChrome';
export {
  createBlockChromeAnchor,
  createSelectedBlockTracker,
  deleteBlockAt,
  selectedBlockPos,
  setBlockAttrs,
} from './chrome/blockChrome';
export {
  createToolbarContainer,
  ICON,
  mkButtonGroup,
  mkDivider,
  mkDragHandle,
  mkIconButton,
  mkLabel,
  mkSpacer,
  svgIcon,
} from './chrome/vanillaToolbar';
// Vanilla block overlay installer（G3・gif/image/table の DialogHost 3 を vanilla 配線）。
export type {
  BlockOverlaysHandle,
  InstallBlockOverlaysOptions,
} from './chrome/installBlockOverlays';
export { installBlockOverlays } from './chrome/installBlockOverlays';
// Vanilla host seam（G・脱React で editor を mount）。
export type { VanillaEditorHostHandle, VanillaEditorHostOptions } from './host/vanillaEditorHost';
export { createVanillaEditorHost } from './host/vanillaEditorHost';
// Vanilla ui プリミティブ（F・脱React ui kit。chrome/host が消費する素 DOM 部品）。
export * from '@anytime-markdown/ui-core';
export type { DarkDiagramPrintPreparer } from './types/pdf';

// NodeView chrome は各ブロックの選択駆動オーバーレイ（*BlockOverlay）が提供する。
// EmbedNodeView（React island）は markdown-react-islands へ移設。

// Extensions
// CodeBlockWithMermaid / CodeBlockNodeView は markdown-rich へ物理移動済み (B-3+B-4)。
// getBaseExtensions は core 残留 (codeBlockExtension 注入版)。
export { getBaseExtensions } from './editorExtensions';
export { CustomHardBreak } from './extensions/customHardBreak';
export { CustomTableCell, CustomTableHeader } from './extensions/customTableCells';
export { DeleteLineExtension } from './extensions/deleteLineExtension';
export { DiffHighlight, diffHighlightPluginKey } from './extensions/diffHighlight';
export { HeadingFoldExtension, headingFoldPluginKey } from './extensions/headingFoldExtension';
export { CustomImage } from './imageExtension';
export { appLowlight } from './lowlight';
export type { SearchReplaceStorage } from './searchReplaceExtension';
export { SearchReplaceExtension } from './searchReplaceExtension';
export { CustomTable } from './tableExtension';
export type { BlockDiffResult } from './utils/blockDiffComputation';
export { computeBlockDiff } from './utils/blockDiffComputation';

// Types
export type {
  HeadingItem,
  MarkdownStorage,
  MdSerializerState,
  MutableRefLike,
  OutlineKind,
} from './types';
export {
  extractHeadings,
  getEditorStorage,
  getMarkdownFromEditor,
  getMarkdownStorage,
} from './types';
export type { FileHandle, FileOpenResult, FileSystemProvider } from './types/fileSystem';
export { WebFileSystemProvider } from './fs/webFileSystemProvider';
export type {
  WebImportFetchResult,
  WebImportProvider,
  WebImportProviderChangeListener,
} from './webImport/webImportProvider';
export {
  getWebImportProvider,
  setWebImportProvider,
  subscribeWebImportProvider,
} from './webImport/webImportProvider';
export { fetchAndConvert } from './webImport/importWebPage';
export type {
ToolbarFileCapabilities,
ToolbarFileHandlers, ToolbarModeHandlers,
  ToolbarModeState,   ToolbarVisibility, } from './types/toolbar';

// Version
export { APP_VERSION } from './version';

// Constants
export {
  ACCENT_COLOR, ACCENT_COLOR_ALPHA,
  CAPTURE_BG,
  COMMON_WHITE,
  DARK_ACTION_HOVER, DARK_ACTION_SELECTED, DARK_BG_PAPER, DARK_DIVIDER,
  DARK_ERROR_MAIN,
  DARK_GREY_100, DARK_GREY_300, DARK_GREY_900,
  DARK_PRIMARY_CONTRAST, DARK_PRIMARY_DARK, DARK_PRIMARY_LIGHT, DARK_PRIMARY_MAIN,
  DARK_SUCCESS_MAIN,
  DARK_TEXT_DISABLED, DARK_TEXT_PRIMARY, DARK_TEXT_SECONDARY,
  DARK_WARNING_LIGHT, DARK_WARNING_MAIN,
  DEFAULT_DARK_BG,   DEFAULT_DARK_CODE_BG,   DEFAULT_DARK_HEADING_BG,   DEFAULT_DARK_HEADING_LINK,   DEFAULT_DARK_TEXT, DEFAULT_LIGHT_BG,
DEFAULT_LIGHT_CODE_BG,
DEFAULT_LIGHT_HEADING_BG,
DEFAULT_LIGHT_HEADING_LINK,
DEFAULT_LIGHT_TEXT,
  FILE_DROP_OVERLAY_COLOR,
  getActionHover, getActionSelected, getBgPaper, getDivider,
getEditDialogBg, getEditDialogBgColor, getEditorBg, getEditorText,
  getErrorBg, getErrorMain, getGrey, getInfoBg, getInfoMain,
  getPrimaryContrast, getPrimaryDark, getPrimaryLight, getPrimaryMain,
  getSuccessBg, getSuccessMain, getTextDisabled, getTextPrimary, getTextSecondary,
  getWarningBg, getWarningLight, getWarningMain,
  HLJS_DARK, HLJS_LIGHT,
  LIGHT_ACTION_HOVER, LIGHT_ACTION_SELECTED, LIGHT_BG_PAPER, LIGHT_DIVIDER,
LIGHT_ERROR_MAIN,
LIGHT_GREY_100, LIGHT_GREY_300, LIGHT_GREY_900,
LIGHT_PRIMARY_CONTRAST, LIGHT_PRIMARY_DARK, LIGHT_PRIMARY_LIGHT, LIGHT_PRIMARY_MAIN,
LIGHT_SUCCESS_MAIN,
LIGHT_TEXT_DISABLED, LIGHT_TEXT_PRIMARY, LIGHT_TEXT_SECONDARY,
LIGHT_WARNING_LIGHT, LIGHT_WARNING_MAIN,
PLANTUML_DARK_BG,   PLANTUML_DARK_FG, PLANTUML_DARK_SURFACE,
} from './constants/colors';
export { defaultContent } from './constants/defaultContent';
export {
  CHIP_FONT_SIZE,
  COMMENT_PANEL_WIDTH,
  EDITOR_HEIGHT_DEFAULT,   EDITOR_HEIGHT_MD, EDITOR_HEIGHT_MIN,
  FS_CHIP_HEIGHT, FS_CODE_INITIAL_WIDTH, FS_CODE_MIN_WIDTH,
  FS_PANEL_HEADER_FONT_SIZE, FS_TAB_FONT_SIZE, FS_TOOLBAR_HEIGHT, FS_ZOOM_LABEL_WIDTH,
EDITOR_HEIGHT_MOBILE, EDITOR_PADDING_BORDER,
EDITOR_PADDING_TOP,   MENU_ITEM_FONT_SIZE,   OUTLINE_WIDTH_DEFAULT, OUTLINE_WIDTH_MAX,
OUTLINE_WIDTH_MIN,   PREVIEW_MAX_HEIGHT,
RADIUS_FULL, RADIUS_LG, RADIUS_MD, RADIUS_NONE, RADIUS_SM,
SMALL_CAPTION_FONT_SIZE,
SPACING_3XS, SPACING_LG, SPACING_MD, SPACING_SM, SPACING_XL, SPACING_XS, SPACING_XXL, SPACING_XXS,
STATUSBAR_HEIGHT,
} from './constants/dimensions';
export type { DiagramSample } from './constants/samples';
export { MATH_SAMPLES, MERMAID_SAMPLES, PLANTUML_SAMPLES, ANYTIME_GRAPH_SAMPLES, ANYTIME_CHART_SAMPLES, SCREENMOCK_SAMPLES } from './constants/samples';
export { isMac, KEYBOARD_SHORTCUTS, modKey } from './constants/shortcuts';
export {
STORAGE_KEY_CONTENT, STORAGE_KEY_EDITOR_MODE,
STORAGE_KEY_READONLY_MODE, STORAGE_KEY_REVIEW_MODE,
STORAGE_KEY_SETTINGS, STORAGE_KEY_SOURCE_MODE, } from './constants/storageKeys';
export { clearDraft, readDraft, writeDraft } from './utils/draftStorage';
export type { MarkdownTemplate } from './constants/templates';
export { BUILTIN_TEMPLATES } from './constants/templates';
export type { ThemePreset, ThemePresetName } from './constants/themePresets';
export {
  DEFAULT_PRESET_NAME, getPreset, isPresetName, PRESET_NAMES, THEME_PRESETS,
} from './constants/themePresets';
export { DURATION_FAST, REDUCED_MOTION_SX, getSplitterSx } from './constants/uiPatterns';
export { DEBOUNCE_MEDIUM,DEBOUNCE_SHORT, FETCH_TIMEOUT, MERMAID_RENDER_TIMEOUT, NOTIFICATION_DURATION, PRINT_DELAY } from './constants/timing';
export { Z_FULLSCREEN, Z_LINK_TOOLTIP, Z_SKIP_LINK,Z_TOOLBAR } from './constants/zIndex';

// Utils
export type { DiffBlock, DiffLine, DiffOptions, DiffResult, InlineSegment } from './utils/diffEngine';
export { applyMerge,computeDiff, computeInlineDiff, computeSemanticDiff } from './utils/diffEngine';
export { buildColorRuns } from './utils/colorRuns';
export type { EmbedBaseline, EmbedVariant } from './utils/embedInfoString';
export { buildEmbedInfoString, DEFAULT_EMBED_BASELINE, parseEmbedInfoString } from './utils/embedInfoString';
export { buildPlantUmlUrl,PLANTUML_CONSENT_KEY, PLANTUML_DARK_SKINPARAMS, PLANTUML_LIGHT_SKINPARAMS, PLANTUML_SERVER } from './utils/plantumlHelpers';
export { preserveBlankLines, restoreBlankLines, sanitizeMarkdown, splitByCodeBlocks } from './utils/sanitizeMarkdown';
export type { ApplyEditorThemeCssVarsOptions } from './utils/applyEditorThemeCssVars';
export { applyChromeTokens, applyEditorThemeCssVars, ensureChromeTokens } from './utils/applyEditorThemeCssVars';
export { getSectionRange, moveHeadingSection } from './utils/sectionHelpers';
export { moveTableColumn,moveTableRow } from './utils/tableHelpers';
export { saveBlob } from './utils/clipboardHelpers';
// vendored tiptap getPos の安全ラッパ（detached ノードで throw → undefined）。
export { safeGetPos } from './utils/safeGetPos';
export type { MarkdownItLike } from './utils/embedFenceRenderer';
export { EMBED_DATA_ATTR, installEmbedFenceRenderer } from './utils/embedFenceRenderer';

// Styles
export { getHljsCssVars, getHljsStyles, getHljsTokenCss } from './styles/codeStyles';

// Icons

// Contexts（ThemeModeContext / ConfirmProvider 等の React provider は markdown-react-islands へ移設）
export { findCodeBlockByIndex, findCounterpartCode, getCodeBlockIndex, getMergeEditors } from './contexts/MergeEditorsContext';
export type { DialogOptions } from './providers/types';

// i18n messages
export type { MarkdownMessages } from './i18n';
export { enMessages as messagesEn, jaMessages as messagesJa } from './i18n';

// 脱React G3: vanilla consumer 配線用（初期コンテンツ）
export { getDefaultContent } from './constants/defaultContent';

// Embed プレビューの外部 fetch 注入（consumer が起動時に設定。実装 createEmbedPreview は
// rich の CodeBlockBlockContent が deep import する内部 API のため barrel 非公開）
export { setEmbedProviders, getEmbedProviders } from './embedProviders';

// Web Component（クラスのみ。customElements.define の副作用は "./element" 側に置く）
export { AnytimeMarkdownEditorElement } from './AnytimeMarkdownEditorElement';
// lean read-only view 要素（クラスのみ。customElements.define は "./view-element" 側）
export { AnytimeMarkdownViewElement } from './AnytimeMarkdownViewElement';
export type { MarkdownChangeDetail } from './AnytimeMarkdownEditorElement';
