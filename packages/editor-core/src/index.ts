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
export { useTimeline } from './hooks/useTimeline';
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
export { FsSearchBar } from './components/FsSearchBar';
export { HelpDialog } from './components/HelpDialog';
export type { MergeUndoRedo } from './components/InlineMergeView';
export { InlineMergeView } from './components/InlineMergeView';
export { getMergeTiptapStyles,MergeEditorPanel } from './components/MergeEditorPanel';
export { OutlinePanel } from './components/OutlinePanel';
export { SearchReplaceBar } from './components/SearchReplaceBar';
export { StatusBar } from './components/StatusBar';
export { TimelineBar } from './components/TimelineBar';
export { TimelineDiffView } from './components/TimelineDiffView';

// NodeView components
export { DetailsNodeView } from './DetailsNodeView';
export { ImageNodeView } from './ImageNodeView';
export { CodeBlockNodeView } from './MermaidNodeView';
export { TableNodeView } from './TableNodeView';

// Extensions
export { CodeBlockWithMermaid } from './codeBlockWithMermaid';
export { Details, DetailsSummary } from './detailsExtension';
export { getBaseExtensions } from './editorExtensions';
export { CustomHardBreak } from './extensions/customHardBreak';
export { CustomTableCell, CustomTableHeader } from './extensions/customTableCells';
export { DeleteLineExtension } from './extensions/deleteLineExtension';
export type { BlockDiffResult } from './extensions/diffHighlight';
export { computeBlockDiff,DiffHighlight, diffHighlightPluginKey } from './extensions/diffHighlight';
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
  TimelineCommit,
  TimelineDataProvider,
  PlaybackSpeed,
  TimelineState,
} from './types/timeline';
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
  DEFAULT_DARK_BG,   DEFAULT_DARK_CODE_BG,   DEFAULT_DARK_HEADING_BG,   DEFAULT_DARK_HEADING_LINK,   DEFAULT_DARK_TEXT, DEFAULT_LIGHT_BG,
DEFAULT_LIGHT_CODE_BG,
DEFAULT_LIGHT_HEADING_BG,
DEFAULT_LIGHT_HEADING_LINK,
DEFAULT_LIGHT_TEXT,
  getEditorBg, getEditorText,
PLANTUML_DARK_BG,   PLANTUML_DARK_FG, PLANTUML_DARK_SURFACE,
} from './constants/colors';
export { defaultContent } from './constants/defaultContent';
export {
  COMMENT_PANEL_WIDTH, EDITOR_HEIGHT_DEFAULT,   EDITOR_HEIGHT_MD, EDITOR_HEIGHT_MIN,
EDITOR_HEIGHT_MOBILE, EDITOR_PADDING_BORDER,
EDITOR_PADDING_TOP,   OUTLINE_WIDTH_DEFAULT, OUTLINE_WIDTH_MAX,
OUTLINE_WIDTH_MIN,   PREVIEW_MAX_HEIGHT, STATUSBAR_HEIGHT,
} from './constants/dimensions';
export type { DiagramSample } from './constants/samples';
export { MERMAID_SAMPLES, PLANTUML_SAMPLES } from './constants/samples';
export { isMac, KEYBOARD_SHORTCUTS, modKey } from './constants/shortcuts';
export {
STORAGE_KEY_CONTENT,
STORAGE_KEY_READONLY_MODE,
STORAGE_KEY_REVIEW_MODE,   STORAGE_KEY_SETTINGS,   STORAGE_KEY_SOURCE_MODE, } from './constants/storageKeys';
export type { MarkdownTemplate } from './constants/templates';
export { BUILTIN_TEMPLATES } from './constants/templates';
export { DEBOUNCE_MEDIUM,DEBOUNCE_SHORT, MERMAID_RENDER_TIMEOUT, NOTIFICATION_DURATION, PRINT_DELAY } from './constants/timing';
export { Z_FULLSCREEN, Z_LINK_TOOLTIP, Z_SKIP_LINK,Z_TOOLBAR } from './constants/zIndex';

// Utils
export type { DiffBlock, DiffLine, DiffOptions, DiffResult, InlineSegment } from './utils/diffEngine';
export { applyMerge,computeDiff, computeInlineDiff } from './utils/diffEngine';
export { buildPlantUmlUrl,PLANTUML_CONSENT_KEY, PLANTUML_DARK_SKINPARAMS, PLANTUML_SERVER } from './utils/plantumlHelpers';
export { preserveBlankLines, restoreBlankLines, sanitizeMarkdown, splitByCodeBlocks } from './utils/sanitizeMarkdown';
export { getSectionRange, moveHeadingSection } from './utils/sectionHelpers';
export { moveTableColumn,moveTableRow } from './utils/tableHelpers';

// Icons
export { default as MarkdownIcon } from './icons/MarkdownIcon';
export { default as MermaidIcon } from './icons/MermaidIcon';

// Providers
export { ConfirmContext,ConfirmProvider } from './providers/ConfirmProvider';
export type { DialogOptions } from './providers/types';

// i18n messages
export { default as messagesEn } from './i18n/en.json';
export { default as messagesJa } from './i18n/ja.json';
