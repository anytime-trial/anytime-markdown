// Main page component
export { default as MarkdownEditorPage } from './MarkdownEditorPage';

// Hooks
export { useEditorDialogs } from './hooks/useEditorDialogs';
export { useEditorFileOps } from './hooks/useEditorFileOps';
export { useMergeDiff } from './hooks/useMergeDiff';
export { useOutline } from './hooks/useOutline';
export { useSourceMode } from './hooks/useSourceMode';
export type { TextareaSearchMatch, TextareaSearchState } from './hooks/useTextareaSearch';
export { useTextareaSearch } from './hooks/useTextareaSearch';
export type { UseZoomPanReturn } from './hooks/useZoomPan';
export { useZoomPan } from './hooks/useZoomPan';
export type { EditorSettings } from './useEditorSettings';
export {
  DEFAULT_SETTINGS,
  EditorSettingsContext,
  useEditorSettings,
  useEditorSettingsContext,
} from './useEditorSettings';
export { useMarkdownEditor } from './useMarkdownEditor';

// Components
export { EditorBubbleMenu } from './components/EditorBubbleMenu';
export { EditorDialogs } from './components/EditorDialogs';
export { EditorMenuPopovers } from './components/EditorMenuPopovers';
export { EditorSettingsPanel } from './components/EditorSettingsPanel';
export { EditorToolbar } from './components/EditorToolbar';
export type { MergeUndoRedo } from './components/InlineMergeView';
export { InlineMergeView } from './components/InlineMergeView';
export { getMergeTiptapStyles,MergeEditorPanel } from './components/MergeEditorPanel';
export { OutlinePanel } from './components/OutlinePanel';
export { SearchReplaceBar } from './components/SearchReplaceBar';
export { StatusBar } from './components/StatusBar';

// NodeView components
export { ImageNodeView } from './ImageNodeView';
export { CodeBlockNodeView } from './MermaidNodeView';
export { TableNodeView } from './TableNodeView';

// Extensions
export { CodeBlockWithMermaid } from './codeBlockWithMermaid';
export { getBaseExtensions } from './editorExtensions';
export { CustomHardBreak } from './extensions/customHardBreak';
export { CustomTableCell, CustomTableHeader } from './extensions/customTableCells';
export { DeleteLineExtension } from './extensions/deleteLineExtension';
export type { BlockDiffResult } from './utils/blockDiffComputation';
export { computeBlockDiff } from './utils/blockDiffComputation';
export { DiffHighlight, diffHighlightPluginKey } from './extensions/diffHighlight';
export { HeadingFoldExtension, headingFoldPluginKey } from './extensions/headingFoldExtension';
export { CustomImage } from './imageExtension';
export type { SearchReplaceStorage } from './searchReplaceExtension';
export { SearchReplaceExtension } from './searchReplaceExtension';
export { CustomTable } from './tableExtension';

// Types
export type {
  HeadingItem,
  MarkdownStorage,
  MdSerializerState,
  OutlineKind,
  PlantUmlToolbarContextValue,
} from './types';
export {
  extractHeadings,
  getEditorStorage,
  getMarkdownFromEditor,
  getMarkdownStorage,
  PlantUmlToolbarContext,
  usePlantUmlToolbar,
} from './types';
export type { FileHandle, FileOpenResult, FileSystemProvider } from './types/fileSystem';
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
getEditDialogBg,   getEditorBg, getEditorText,
  getErrorBg, getErrorMain, getGrey, getInfoBg, getInfoMain,
  getPrimaryContrast, getPrimaryDark, getPrimaryLight, getPrimaryMain,
  getSuccessBg, getSuccessMain, getTextDisabled, getTextPrimary, getTextSecondary,
  getWarningBg, getWarningLight, getWarningMain,
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
  COMMENT_PANEL_WIDTH, EDITOR_HEIGHT_DEFAULT,   EDITOR_HEIGHT_MD, EDITOR_HEIGHT_MIN,
EDITOR_HEIGHT_MOBILE, EDITOR_PADDING_BORDER,
EDITOR_PADDING_TOP,   OUTLINE_WIDTH_DEFAULT, OUTLINE_WIDTH_MAX,
OUTLINE_WIDTH_MIN,   PREVIEW_MAX_HEIGHT,
RADIUS_FULL, RADIUS_LG, RADIUS_MD, RADIUS_NONE, RADIUS_SM,
SPACING_3XS, SPACING_LG, SPACING_MD, SPACING_SM, SPACING_XL, SPACING_XS, SPACING_XXL, SPACING_XXS,
STATUSBAR_HEIGHT,
} from './constants/dimensions';
export type { DiagramSample } from './constants/samples';
export { MERMAID_SAMPLES, PLANTUML_SAMPLES } from './constants/samples';
export { isMac, KEYBOARD_SHORTCUTS, modKey } from './constants/shortcuts';
export {
STORAGE_KEY_CONTENT, STORAGE_KEY_EDITOR_MODE,
STORAGE_KEY_READONLY_MODE, STORAGE_KEY_REVIEW_MODE,
STORAGE_KEY_SETTINGS, STORAGE_KEY_SOURCE_MODE, } from './constants/storageKeys';
export type { MarkdownTemplate } from './constants/templates';
export { BUILTIN_TEMPLATES } from './constants/templates';
export type { ThemePreset, ThemePresetName } from './constants/themePresets';
export {
  DEFAULT_PRESET_NAME, getPreset, isPresetName, PRESET_NAMES, THEME_PRESETS,
} from './constants/themePresets';
export { DEBOUNCE_MEDIUM,DEBOUNCE_SHORT, MERMAID_RENDER_TIMEOUT, NOTIFICATION_DURATION, PRINT_DELAY } from './constants/timing';
export { Z_FULLSCREEN, Z_LINK_TOOLTIP, Z_SKIP_LINK,Z_TOOLBAR } from './constants/zIndex';

// Utils
export type { DiffBlock, DiffLine, DiffOptions, DiffResult, InlineSegment } from './utils/diffEngine';
export { applyMerge,computeDiff, computeInlineDiff, computeSemanticDiff } from './utils/diffEngine';
export { buildPlantUmlUrl,PLANTUML_CONSENT_KEY, PLANTUML_DARK_SKINPARAMS, PLANTUML_SERVER } from './utils/plantumlHelpers';
export { preserveBlankLines, restoreBlankLines, sanitizeMarkdown, splitByCodeBlocks } from './utils/sanitizeMarkdown';
export { getSectionRange, moveHeadingSection } from './utils/sectionHelpers';
export { moveTableColumn,moveTableRow } from './utils/tableHelpers';

// Icons
export { default as MarkdownIcon } from './icons/MarkdownIcon';
export { default as MermaidIcon } from './icons/MermaidIcon';

// Contexts
export { EditorModeContext, useEditorMode } from './contexts/EditorModeContext';
export type { EditorModeContextValue, EditorModeState } from './contexts/EditorModeContext';

// Providers
export { ConfirmContext,ConfirmProvider } from './providers/ConfirmProvider';
export type { DialogOptions } from './providers/types';

// i18n messages
export { default as messagesEn } from './i18n/en.json';
export { default as messagesJa } from './i18n/ja.json';
