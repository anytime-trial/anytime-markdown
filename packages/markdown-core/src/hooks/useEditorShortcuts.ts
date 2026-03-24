import { useEffect } from "react";

interface UseEditorShortcutsParams {
  sourceMode: boolean;
  readonlyMode?: boolean;
  reviewMode?: boolean;
  handleSaveFile: () => void;
  handleSaveAsFile: () => void;
  handleOpenFile: () => void;
  handleClear: () => void;
  handleCopy: () => void;
  handleSwitchToSource: () => void;
  handleSwitchToWysiwyg: () => void;
  handleSwitchToReview?: () => void;
  handleSwitchToReadonly?: () => void;
  handleMerge: () => void;
}

export function useEditorShortcuts({
  sourceMode, readonlyMode, reviewMode,
  handleSaveFile, handleSaveAsFile, handleOpenFile,
  handleClear, handleCopy,
  handleSwitchToSource, handleSwitchToWysiwyg, handleSwitchToReview, handleSwitchToReadonly, handleMerge,
}: UseEditorShortcutsParams) {
  // ファイル操作ショートカット (Ctrl/Cmd+S, Ctrl/Cmd+O)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      // Ctrl+Shift 系
      if (e.shiftKey && !e.altKey) {
        if (key === 's') { e.preventDefault(); handleSaveAsFile(); }
        else if (key === 'c') { e.preventDefault(); handleCopy(); }
        return;
      }
      // Ctrl 系（Alt なし、Shift なし）
      if (e.altKey || e.shiftKey) return;
      if (key === 's') {
        e.preventDefault();
        handleSaveFile();
      } else if (key === 'o') {
        e.preventDefault();
        handleOpenFile();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleSaveFile, handleSaveAsFile, handleOpenFile, handleCopy]);

  // ツールバー操作のキーボードショートカット (Ctrl/Cmd+Alt)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || !(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      // readonly/レビューモード時は編集系ショートカットを無効化（モード切替・アウトラインは許可）
      if (key === "s") {
        // 4モード循環: Readonly → Review → Edit → Source → Readonly
        e.preventDefault();
        if (readonlyMode) { handleSwitchToReview?.() ?? handleSwitchToWysiwyg(); }
        else if (reviewMode) { handleSwitchToWysiwyg(); }
        else if (sourceMode) { handleSwitchToReadonly?.() ?? handleSwitchToWysiwyg(); }
        else { handleSwitchToSource(); }
      }
      else if (readonlyMode || reviewMode) { return; } // readonly/レビューモードではこれ以降の編集系ショートカットを無効化
      else if (key === "m") { e.preventDefault(); handleMerge(); }
      else if (key === "n") { e.preventDefault(); handleClear(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [sourceMode, readonlyMode, reviewMode, handleSwitchToWysiwyg, handleSwitchToSource, handleSwitchToReview, handleSwitchToReadonly, handleMerge, handleClear]);
}
