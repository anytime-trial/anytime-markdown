import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";

import { reviewModeStorage } from "../extensions/reviewModeExtension";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";

interface UseMergeContentSyncParams {
  sourceMode: boolean;
  leftEditor: Editor | null;
  rightEditor: Editor | null | undefined;
  editorContent: string;
  compareText: string;
  setEditText: (text: string) => void;
  setCompareText: (text: string) => void;
}

const SYNC_TARGET_TYPES = new Set(["codeBlock", "table", "image"]);

interface CollapsedState {
  type: string;
  index: number;
  collapsed?: boolean;
  codeCollapsed?: boolean;
}

/** Collect collapsed/codeCollapsed states from a ProseMirror doc */
function collectCollapsedStates(doc: ProseMirrorNode): CollapsedState[] {
  const states: CollapsedState[] = [];
  const counters: Record<string, number> = {};
  doc.descendants((node) => {
    if (SYNC_TARGET_TYPES.has(node.type.name)) {
      const key = node.type.name;
      counters[key] = (counters[key] || 0) + 1;
      states.push({
        type: key,
        index: counters[key] - 1,
        collapsed: node.attrs.collapsed,
        codeCollapsed: node.attrs.codeCollapsed,
      });
    }
  });
  return states;
}

/** Apply collected collapsed states to a target doc via transaction */
function applyCollapsedStates(
  doc: ProseMirrorNode,
  tr: Transaction,
  sourceStates: CollapsedState[],
): boolean {
  const counters: Record<string, number> = {};
  let changed = false;
  doc.descendants((node, pos) => {
    if (SYNC_TARGET_TYPES.has(node.type.name)) {
      const key = node.type.name;
      counters[key] = (counters[key] || 0) + 1;
      const idx = counters[key] - 1;
      const srcState = sourceStates.find(s => s.type === key && s.index === idx);
      if (!srcState) return;
      let nodeChanged = false;
      const newAttrs: Record<string, unknown> = { ...node.attrs };
      if (srcState.collapsed !== undefined && node.attrs.collapsed !== srcState.collapsed) {
        newAttrs.collapsed = srcState.collapsed;
        nodeChanged = true;
      }
      if (srcState.codeCollapsed !== undefined && node.attrs.codeCollapsed !== srcState.codeCollapsed) {
        newAttrs.codeCollapsed = srcState.codeCollapsed;
        nodeChanged = true;
      }
      if (nodeChanged) {
        tr.setNodeMarkup(pos, undefined, newAttrs);
        changed = true;
      }
    }
  });
  return changed;
}

export function useMergeContentSync({
  sourceMode,
  leftEditor,
  rightEditor,
  editorContent,
  compareText,
  setEditText,
  setCompareText: _setCompareText,
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
