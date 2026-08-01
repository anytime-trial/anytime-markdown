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
  /** 注入されている場合、「開く」メニューに「GitHub から開く」が並ぶ（Drive と独立）。 */
  onOpenFromGitHub?: () => void | Promise<void>;
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
  /**
   * 上書き保存の宛先があるか。ローカルの FileHandle と外部保存（Google Drive / GitHub 等）の
   * 双方を含む。ローカルハンドルの有無だけで判定すると Drive から開いた本文で上書き保存が
   * 無効化されるため、宛先の種類を問わない名前にしている。
   */
  hasSaveTarget?: boolean;
  supportsDirectAccess?: boolean;
  /** 外部保存のみ（GitHub SSO 等）: 新規作成・開く・名前を付けて保存を非表示 */
  externalSaveOnly?: boolean;
  /**
   * 上書き保存の宛先の種別。`"github"` のとき上書き保存は GitHub へのコミットになるため、
   * ラベルを「GitHub にコミット」へ差し替える。ローカルへ保存先が移った時点で undefined に戻る。
   */
  externalSaveKind?: "github" | "drive";
}

/** エディタのモード状態 */
export interface ToolbarModeState {
  sourceMode: boolean;
  /**
   * ユーザーがツールバーで選んだ "readonly" モード。ホストが課す {@link hostReadOnly} とは独立で、
   * 常に sourceModeController の内部 mode と一致する（畳み込むとモード切替が固まる）。
   */
  readonlyMode?: boolean;
  /**
   * ホストが `readOnly` prop で課した編集ロック。ユーザーはモード切替で解除できないため、
   * モード切替グループごと無効化して「切替不可」を可視化する。
   */
  hostReadOnly?: boolean;
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
