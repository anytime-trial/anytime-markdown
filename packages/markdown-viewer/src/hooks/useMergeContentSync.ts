import type { Editor } from "@anytime-markdown/markdown-react";
import { useEffect, useRef } from "react";

import { reviewModeStorage } from "../extensions/reviewModeExtension";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";
import {
  applyCollapsedStates,
  collectCollapsedStates,
  normalizeCompareMarkdown,
} from "../utils/mergeContentSync";

// 既存の consumer（テスト含む）の import 互換のため re-export する。
export { normalizeCompareMarkdown };

interface UseMergeContentSyncParams {
  sourceMode: boolean;
  leftEditor: Editor | null;
  rightEditor: Editor | null | undefined;
  editorContent: string;
  compareText: string;
  setEditText: (text: string) => void;
  setCompareText: (text: string) => void;
}

export function useMergeContentSync({
  sourceMode,
  leftEditor,
  rightEditor,
  editorContent,
  compareText,
  setEditText,
  setCompareText,
}: Readonly<UseMergeContentSyncParams>): void {
  // ReviewMode 有効化
  useEffect(() => {
    if (leftEditor) {
      reviewModeStorage(leftEditor).enabled = true;
    }
  }, [leftEditor]);

  // editorContent -> leftText sync
  useEffect(() => {
    setEditText(editorContent);
  }, [editorContent, setEditText]);

  // ソースモード: 比較（左）テキストも Tiptap 往復で正規化し、編集（右）側と
  // 同一正規化レベルで diff を取る（偽差分防止）。左パネルが生テキスト表示の
  // ソースモード専用。WYSIWYG は doc ベース diff のため下の effect 側で対応。
  useEffect(() => {
    if (!leftEditor || !sourceMode || compareText === "") return;
    const id = requestAnimationFrame(() => {
      if (leftEditor.isDestroyed) return;
      reviewModeStorage(leftEditor).enabled = false;
      const normalized = normalizeCompareMarkdown(leftEditor, compareText);
      reviewModeStorage(leftEditor).enabled = true;
      if (normalized !== compareText) setCompareText(normalized);
    });
    return () => cancelAnimationFrame(id);
  }, [compareText, leftEditor, sourceMode, setCompareText]);

  // compareText -> right tiptap editor sync
  useEffect(() => {
    if (leftEditor && !sourceMode) {
      // React レンダリング中の flushSync 競合を回避するため次フレームに遅延
      const id = requestAnimationFrame(() => {
        if (leftEditor.isDestroyed) return;
        reviewModeStorage(leftEditor).enabled = false;
        applyMarkdownToEditor(leftEditor, compareText);
        reviewModeStorage(leftEditor).enabled = true;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [compareText, leftEditor, sourceMode]);

  // When switching from source -> WYSIWYG, populate right editor
  const prevSourceMode = useRef(sourceMode);
  useEffect(() => {
    let id: number | undefined;
    if (prevSourceMode.current && !sourceMode && leftEditor) {
      id = requestAnimationFrame(() => {
        if (leftEditor.isDestroyed) return;
        reviewModeStorage(leftEditor).enabled = false;
        applyMarkdownToEditor(leftEditor, compareText);
        reviewModeStorage(leftEditor).enabled = true;
      });
    }
    prevSourceMode.current = sourceMode;
    return () => { if (id !== undefined) cancelAnimationFrame(id); };
  }, [sourceMode, leftEditor, compareText]);

  // 左エディタのブロック展開/折りたたみ状態を右エディタに同期
  useEffect(() => {
    if (!rightEditor || !leftEditor || sourceMode) return;
    let rafId: number | undefined;
    const syncCollapsed = () => {
      if (rightEditor.isDestroyed || leftEditor.isDestroyed) return;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      const sourceStates = collectCollapsedStates(rightEditor.state.doc);
      rafId = requestAnimationFrame(() => {
        if (leftEditor.isDestroyed) return;
        const tr = leftEditor.state.tr;
        const changed = applyCollapsedStates(leftEditor.state.doc, tr, sourceStates);
        if (changed) {
          reviewModeStorage(leftEditor).enabled = false;
          leftEditor.view.dispatch(tr);
          reviewModeStorage(leftEditor).enabled = true;
        }
      });
    };
    rightEditor.on("update", syncCollapsed);
    return () => {
      rightEditor.off("update", syncCollapsed);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [rightEditor, leftEditor, sourceMode]);
}
