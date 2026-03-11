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
