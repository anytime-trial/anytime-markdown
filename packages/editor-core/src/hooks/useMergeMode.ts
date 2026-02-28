import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { MergeUndoRedo } from "../components/InlineMergeView";
import { getMarkdownFromEditor } from "../types";

interface UseMergeModeParams {
  editor: Editor | null;
  sourceMode: boolean;
  isLg: boolean;
  outlineOpen: boolean;
  handleToggleOutline: () => void;
  onCompareModeChange?: (open: boolean) => void;
  t: (key: string) => string;
  setLiveMessage: (msg: string) => void;
}

export function useMergeMode({
  editor, sourceMode, isLg, outlineOpen, handleToggleOutline,
  onCompareModeChange, t, setLiveMessage,
}: UseMergeModeParams) {
  const [inlineMergeOpen, setInlineMergeOpen] = useState(false);
  const [editorMarkdown, setEditorMarkdown] = useState("");
  const [mergeUndoRedo, setMergeUndoRedo] = useState<MergeUndoRedo | null>(null);
  const [compareFileContent, setCompareFileContent] = useState<string | null>(null);
  const [rightFileOps, setRightFileOps] = useState<{ loadFile: () => void; exportFile: () => void } | null>(null);

  const handleMerge = useCallback(() => {
    if (inlineMergeOpen) {
      setInlineMergeOpen(false);
      setLiveMessage(t("switchedToNormal"));
    } else {
      if (!isLg) return;
      if (outlineOpen) handleToggleOutline();
      if (!sourceMode && editor) {
        setEditorMarkdown(getMarkdownFromEditor(editor));
      }
      setInlineMergeOpen(true);
      setLiveMessage(t("switchedToCompare"));
    }
  }, [sourceMode, editor, inlineMergeOpen, isLg, outlineOpen, handleToggleOutline, t, setLiveMessage]);

  // マージモードが閉じたときにデコレーションをクリア
  useEffect(() => {
    if (!inlineMergeOpen && editor) {
      editor.commands.clearDiffHighlight();
    }
  }, [inlineMergeOpen, editor]);

  // 比較モード変更を外部に通知（VS Code 拡張用）
  useEffect(() => {
    onCompareModeChange?.(inlineMergeOpen);
  }, [inlineMergeOpen, onCompareModeChange]);

  // VS Code 拡張から比較ファイルを読み込む
  useEffect(() => {
    const handler = (e: Event) => {
      const content = (e as CustomEvent<string>).detail;
      setCompareFileContent(content);
      if (!inlineMergeOpen) {
        if (!sourceMode && editor) {
          setEditorMarkdown(getMarkdownFromEditor(editor));
        }
        setInlineMergeOpen(true);
      }
    };
    window.addEventListener('vscode-load-compare-file', handler);
    return () => window.removeEventListener('vscode-load-compare-file', handler);
  }, [editor, sourceMode, inlineMergeOpen]);

  // 画面が小さくなったら比較モードを自動で閉じる
  useEffect(() => {
    if (!isLg && inlineMergeOpen) {
      setInlineMergeOpen(false);
    }
  }, [isLg, inlineMergeOpen]);

  return {
    inlineMergeOpen, setInlineMergeOpen,
    editorMarkdown, setEditorMarkdown,
    mergeUndoRedo, setMergeUndoRedo,
    compareFileContent, setCompareFileContent,
    rightFileOps, setRightFileOps,
    handleMerge,
  };
}
