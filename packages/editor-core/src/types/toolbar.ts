/** ツールバーの表示/非表示設定 */
export interface ToolbarVisibility {
  fileOps?: boolean;
  undoRedo?: boolean;
  moreMenu?: boolean;
  settings?: boolean;
  versionInfo?: boolean;
  modeToggle?: boolean;
  readonlyToggle?: boolean;
  outline?: boolean;
  comments?: boolean;
  templates?: boolean;
  foldAll?: boolean;
  toolbar?: boolean;   // EditorToolbarSection 専用
  help?: boolean;      // EditorToolbarSection 専用
}

/** ファイル操作ハンドラ */
export interface ToolbarFileHandlers {
  onDownload: () => void;
  onImport: () => void;
  onClear: () => void;
  onOpenFile?: () => void;
  onSaveFile?: () => void;
  onSaveAsFile?: () => void;
  onExportPdf?: () => void;
  onLoadRightFile?: () => void;
  onExportRightFile?: () => void;
}

/** ファイルシステム機能フラグ */
export interface ToolbarFileCapabilities {
  hasFileHandle?: boolean;
  supportsDirectAccess?: boolean;
}

/** エディタのモード状態 */
export interface ToolbarModeState {
  sourceMode: boolean;
  readonlyMode?: boolean;
  reviewMode?: boolean;
  outlineOpen: boolean;
  inlineMergeOpen: boolean;
  commentOpen?: boolean;
}

/** モード切替ハンドラ */
export interface ToolbarModeHandlers {
  onSwitchToSource: () => void;
  onSwitchToWysiwyg: () => void;
  onSwitchToReview?: () => void;
  onSwitchToReadonly?: () => void;
  onToggleOutline: () => void;
  onToggleComments?: () => void;
  onMerge: () => void;
}
