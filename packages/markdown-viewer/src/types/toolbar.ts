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
  /** 注入されている場合、ツールバーの「開く」はメニュー化され本ハンドラが選択肢に並ぶ。 */
  onOpenFromDrive?: () => void | Promise<void>;
  /** 新規作成（未保存データがあれば保存確認を挟む）。 */
  onNewFile?: () => void | Promise<void>;
  /** 注入されている場合、保存メニューに「Google Drive に保存」が並ぶ。 */
  onSaveToDrive?: () => void | Promise<void>;
  onSaveFile?: () => void | Promise<void>;
  onSaveAsFile?: () => void | Promise<void>;
  onWebImport?: () => void | Promise<void>;
  onWebImportCreate?: (markdown: string, title: string) => void | Promise<void>;
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
  /** ノート網パネル（ホスト所有の右パネル）の開状態。 */
  noteGraphOpen?: boolean;
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
  /** ノート網パネルのトグル（ホスト所有パネル提供時のみ）。 */
  onToggleNoteGraph?: () => void;
}
