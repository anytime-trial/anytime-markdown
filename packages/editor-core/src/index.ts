// Main page component
export { default as MarkdownEditorPage } from './MarkdownEditorPage';

// Hooks
export { useMarkdownEditor } from './useMarkdownEditor';
export {
  useEditorSettings,
  EditorSettingsContext,
  useEditorSettingsContext,
  DEFAULT_SETTINGS,
} from './useEditorSettings';
export type { EditorSettings } from './useEditorSettings';
export { useEditorFileOps } from './hooks/useEditorFileOps';
export { useSourceMode } from './hooks/useSourceMode';
export { useEditorDialogs } from './hooks/useEditorDialogs';
export { useOutline } from './hooks/useOutline';
export { useMergeDiff } from './hooks/useMergeDiff';
export { useZoomPan } from './hooks/useZoomPan';
export type { UseZoomPanReturn } from './hooks/useZoomPan';
export { useTextareaSearch } from './hooks/useTextareaSearch';
export type { TextareaSearchMatch, TextareaSearchState } from './hooks/useTextareaSearch';

// Components
export { EditorToolbar } from './components/EditorToolbar';
export { StatusBar } from './components/StatusBar';
export { EditorBubbleMenu } from './components/EditorBubbleMenu';
export { SearchReplaceBar } from './components/SearchReplaceBar';
export { EditorDialogs } from './components/EditorDialogs';
export { EditorMenuPopovers } from './components/EditorMenuPopovers';
export { EditorSettingsPanel } from './components/EditorSettingsPanel';
export { OutlinePanel } from './components/OutlinePanel';
export { MergeEditorPanel, getMergeTiptapStyles } from './components/MergeEditorPanel';
export { InlineMergeView } from './components/InlineMergeView';
export type { MergeUndoRedo } from './components/InlineMergeView';
export { FsSearchBar } from './components/FsSearchBar';
export { HelpDialog } from './components/HelpDialog';

// NodeView components
export { DetailsNodeView } from './DetailsNodeView';
export { ImageNodeView } from './ImageNodeView';
export { CodeBlockNodeView } from './MermaidNodeView';
export { TableNodeView } from './TableNodeView';

// Extensions
export { getBaseExtensions } from './editorExtensions';
export { SearchReplaceExtension } from './searchReplaceExtension';
export type { SearchReplaceStorage } from './searchReplaceExtension';
export { Details, DetailsSummary } from './detailsExtension';
export { CustomImage } from './imageExtension';
export { CustomTable } from './tableExtension';
export { CodeBlockWithMermaid } from './codeBlockWithMermaid';
export { CustomHardBreak } from './extensions/customHardBreak';
export { CustomTableCell, CustomTableHeader } from './extensions/customTableCells';
export { DeleteLineExtension } from './extensions/deleteLineExtension';
export { DiffHighlight, diffHighlightPluginKey, computeBlockDiff } from './extensions/diffHighlight';
export type { BlockDiffResult } from './extensions/diffHighlight';
export { HeadingFoldExtension, headingFoldPluginKey } from './extensions/headingFoldExtension';

// Types
export {
  getMarkdownFromEditor,
  extractHeadings,
  PlantUmlToolbarContext,
  usePlantUmlToolbar,
} from './types';
export type {
  MdSerializerState,
  MarkdownStorage,
  OutlineKind,
  HeadingItem,
  PlantUmlToolbarContextValue,
} from './types';

// Constants
export { defaultContent } from './constants/defaultContent';
export { KEYBOARD_SHORTCUTS, isMac, modKey } from './constants/shortcuts';
export { MERMAID_SAMPLES, PLANTUML_SAMPLES } from './constants/samples';
export type { DiagramSample } from './constants/samples';
export { BUILTIN_TEMPLATES } from './constants/templates';
export type { MarkdownTemplate } from './constants/templates';

// Utils
export { computeDiff, computeInlineDiff, applyMerge } from './utils/diffEngine';
export type { DiffBlock, DiffLine, DiffResult, DiffOptions, InlineSegment } from './utils/diffEngine';
export { sanitizeMarkdown } from './utils/sanitizeMarkdown';
export { getSectionRange, moveHeadingSection } from './utils/sectionHelpers';
export { moveTableRow, moveTableColumn } from './utils/tableHelpers';
export { PLANTUML_SERVER, PLANTUML_CONSENT_KEY, PLANTUML_DARK_SKINPARAMS } from './utils/plantumlHelpers';

// Icons
export { default as MarkdownIcon } from './icons/MarkdownIcon';
export { default as MermaidIcon } from './icons/MermaidIcon';

// Providers
export { ConfirmProvider, ConfirmContext } from './providers/ConfirmProvider';
export type { DialogOptions } from './providers/types';

// i18n messages
export { default as messagesEn } from './i18n/en.json';
export { default as messagesJa } from './i18n/ja.json';
