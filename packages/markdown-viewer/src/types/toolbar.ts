/** ツールバーの表示/非表示設定 */
export interface ToolbarVisibility {
  fileOps?: boolean;
  undoRedo?: boolean;
  moreMenu?: boolean;
  settings?: boolean;
  versionInfo?: boolean;
  modeToggle?: boolean;
  compareToggle?: boolean;
  readonlyToggle?: boolean;
  outline?: boolean;
  comments?: boolean;
  explorer?: boolean;
  templates?: boolean;
  foldAll?: boolean;
  toolbar?: boolean;   // EditorToolbarSection 専用
}

/** ファイル操作ハンドラ */
export interface ToolbarFileHandlers {
  onDownload: () => void;
  onImport: () => void;
  onClear: () => void;
  onOpenFile?: () => void | Promise<void>;
  onSaveFile?: () => void | Promise<void>;
  onSaveAsFile?: () => void | Promise<void>;
  onExportPdf?: () => void | Promise<void>;
  onLoadRightFile?: () => void;
  onExportRightFile?: () => void;
}

/** ファイルシステム機能フラグ */
export interface ToolbarFileCapabilities {
  hasFileHandle?: boolean;
  supportsDirectAccess?: boolean;
  /** 外部保存のみ（GitHub SSO 等）: 新規作成・開く・名前を付けて保存を非表示 */
  externalSaveOnly?: boolean;
}

/** エディタのモード状態 */
export interface ToolbarModeState {
  sourceMode: boolean;
  readonlyMode?: boolean;
  reviewMode?: boolean;
  outlineOpen: boolean;
  inlineMergeOpen: boolean;
  commentOpen?: boolean;
  explorerOpen?: boolean;
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
  onToggleExplorer?: () => void;
}
