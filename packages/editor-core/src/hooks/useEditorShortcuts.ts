import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Editor } from "@tiptap/react";

interface UseEditorShortcutsParams {
  editor: Editor | null;
  sourceMode: boolean;
  appendToSource: (text: string) => void;
  handleSaveFile: () => void;
  handleSaveAsFile: () => void;
  handleOpenFile: () => void;
  handleImage: () => void;
  handleClear: () => void;
  handleCopy: () => void;
  handleImport: () => void;
  handleDownload: () => void;
  handleToggleAllBlocks: () => void;
  handleToggleOutline: () => void;
  handleSwitchToSource: () => void;
  handleSwitchToWysiwyg: () => void;
  handleMerge: () => void;
  setDiagramAnchorEl: Dispatch<SetStateAction<HTMLElement | null>>;
  setTemplateAnchorEl: Dispatch<SetStateAction<HTMLElement | null>>;
  t: (key: string) => string;
}

export function useEditorShortcuts({
  editor, sourceMode, appendToSource,
  handleSaveFile, handleSaveAsFile, handleOpenFile, handleImage,
  handleClear, handleCopy, handleImport, handleDownload,
  handleToggleAllBlocks, handleToggleOutline,
  handleSwitchToSource, handleSwitchToWysiwyg, handleMerge,
  setDiagramAnchorEl, setTemplateAnchorEl, t,
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
      if (key === "i") { e.preventDefault(); handleImage(); }
      else if (key === "r") {
        e.preventDefault();
        if (sourceMode) { appendToSource("\n---\n"); } else { editor?.chain().focus().setHorizontalRule().run(); }
      }
      else if (key === "t") {
        e.preventDefault();
        if (sourceMode) { appendToSource("\n| Header | Header | Header |\n| ------ | ------ | ------ |\n|        |        |        |\n|        |        |        |\n"); }
        else { editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }
      }
      else if (key === "d") { e.preventDefault(); setDiagramAnchorEl(document.querySelector<HTMLElement>("[aria-label=\"" + t("insertDiagram") + "\"]")); }
      else if (key === "p") { e.preventDefault(); setTemplateAnchorEl(document.querySelector<HTMLElement>("[aria-label=\"" + t("templates") + "\"]")); }
      else if (key === "s") { e.preventDefault(); sourceMode ? handleSwitchToWysiwyg() : handleSwitchToSource(); }
      else if (key === "m") { e.preventDefault(); handleMerge(); }
      else if (key === "n") { e.preventDefault(); handleClear(); }
      else if (key === "u") { e.preventDefault(); handleImport(); }
      else if (key === "e") { e.preventDefault(); handleDownload(); }
      else if (key === "f") { e.preventDefault(); handleToggleAllBlocks(); }
      else if (key === "o") { e.preventDefault(); handleToggleOutline(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editor, sourceMode, appendToSource, t, handleImage, handleSwitchToWysiwyg, handleSwitchToSource, handleMerge, setDiagramAnchorEl, setTemplateAnchorEl, handleClear, handleImport, handleDownload, handleToggleAllBlocks, handleToggleOutline]);
}
