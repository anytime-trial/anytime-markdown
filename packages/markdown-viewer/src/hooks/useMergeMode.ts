import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { MergeUndoRedo } from "../components/InlineMergeView";
import { getMarkdownFromEditor } from "../types";

interface UseMergeModeParams {
  editor: Editor | null;
  sourceMode: boolean;
  isMd: boolean;
  outlineOpen: boolean;
  handleToggleOutline: () => void;
  onCompareModeChange?: (open: boolean) => void;
  t: (key: string) => string;
  setLiveMessage: (msg: string) => void;
}

export function useMergeMode({
  editor, sourceMode, isMd, outlineOpen, handleToggleOutline,
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
      if (!isMd) return;
      if (outlineOpen) handleToggleOutline();
      if (!sourceMode && editor) {
        setEditorMarkdown(getMarkdownFromEditor(editor));
      }
      setInlineMergeOpen(true);
      setLiveMessage(t("switchedToCompare"));
    }
  }, [sourceMode, editor, inlineMergeOpen, isMd, outlineOpen, handleToggleOutline, t, setLiveMessage]);

  // マージモードが閉じたときにデコレーションをクリア
  const prevMergeOpen = useRef(false);
  useEffect(() => {
    if (prevMergeOpen.current && !inlineMergeOpen && editor) {
      const timer = setTimeout(() => {
        if (!editor.isDestroyed) {
          editor.commands.clearDiffHighlight();
        }
      }, 100);
      prevMergeOpen.current = inlineMergeOpen;
      return () => clearTimeout(timer);
    }
    prevMergeOpen.current = inlineMergeOpen;
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
    const exitHandler = () => {
      if (inlineMergeOpen) {
        setInlineMergeOpen(false);
      }
    };
    globalThis.addEventListener('vscode-load-compare-file', handler);
    globalThis.addEventListener('vscode-exit-compare-mode', exitHandler);
    return () => {
      globalThis.removeEventListener('vscode-load-compare-file', handler);
      globalThis.removeEventListener('vscode-exit-compare-mode', exitHandler);
    };
  }, [editor, sourceMode, inlineMergeOpen]);

  // 画面が小さくなったら比較モードを自動で閉じる
  useEffect(() => {
    if (!isMd && inlineMergeOpen) {
      setInlineMergeOpen(false);
    }
  }, [isMd, inlineMergeOpen]);

  return {
    inlineMergeOpen, setInlineMergeOpen,
    editorMarkdown, setEditorMarkdown,
    mergeUndoRedo, setMergeUndoRedo,
    compareFileContent, setCompareFileContent,
    rightFileOps, setRightFileOps,
    handleMerge,
  };
}
