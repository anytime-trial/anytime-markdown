import { createContext, useContext } from "react";

export interface EditorModeState {
  /** WYSIWYG / ソース切替 */
  sourceMode: boolean;
  /** 読み取り専用モード */
  readonlyMode: boolean;
  /** レビューモード */
  reviewMode: boolean;
  /** インラインマージ（比較モード）が開いているか */
  inlineMergeOpen: boolean;
  /** サイドツールバー表示 */
  sideToolbar: boolean;
  /** エクスプローラ表示 */
  explorerOpen: boolean;
  /** スクロール無効化 */
  noScroll: boolean;
}

export interface EditorModeActions {
  onSwitchToReview?: () => void;
  onSwitchToWysiwyg?: () => void;
  onSwitchToSource?: () => void;
}

export type EditorModeContextValue = EditorModeState & EditorModeActions;

const defaultValue: EditorModeContextValue = {
  sourceMode: false,
  readonlyMode: false,
  reviewMode: false,
  inlineMergeOpen: false,
  sideToolbar: false,
  explorerOpen: false,
  noScroll: false,
};

export const EditorModeContext = createContext<EditorModeContextValue>(defaultValue);

export function useEditorMode(): EditorModeContextValue {
  return useContext(EditorModeContext);
}
