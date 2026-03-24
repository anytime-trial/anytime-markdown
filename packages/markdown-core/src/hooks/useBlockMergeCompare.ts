"use client";

import type { NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { findCodeBlockByIndex, findCounterpartCode, getCodeBlockIndex, getMergeEditors } from "../contexts/MergeEditorsContext";

/**
 * Shared merge/compare mode logic for code-block-based node views
 * (RegularCodeBlock, DiagramBlock, MathBlock).
 */
export function useBlockMergeCompare(params: {
  editor: NodeViewProps["editor"];
  getPos: NodeViewProps["getPos"];
  language: string;
  code: string;
  editOpen: boolean;
}): {
  isCompareMode: boolean;
  compareCode: string | null;
  /** このエディタのコード（比較エディタから開いた場合は相手のコードを返す） */
  thisCode: string;
  handleMergeApply: (newThisCode: string, newOtherCode: string) => void;
} {
  const { editor, language, code, editOpen } = params;

  const mergeEditors = getMergeEditors();
  const isCompareMode = !!mergeEditors;

  // 比較エディタ（画面左 = mergeEditors.leftEditor）かどうかを判定
  const isCompareEditor = useMemo(() => {
    if (!editor || !mergeEditors) return false;
    return editor === mergeEditors.leftEditor;
  }, [editor, mergeEditors]);

  const counterpartCode = useMemo(() => {
    if (!editOpen || !mergeEditors || !editor) return null;
    const otherEditor = isCompareEditor ? mergeEditors.rightEditor : mergeEditors.leftEditor;
    return findCounterpartCode(editor, otherEditor, language, code);
  }, [editOpen, mergeEditors, editor, isCompareEditor, language, code]);

  // 比較エディタから開いた場合: thisCode=相手(編集側), compareCode=自分(比較側)
  // 編集エディタから開いた場合: thisCode=自分(編集側), compareCode=相手(比較側)
  const thisCode = isCompareEditor && counterpartCode != null ? counterpartCode : code;
  const compareCode = isCompareEditor && counterpartCode != null ? code : counterpartCode;

  const blockIndexRef = useRef(-1);
  useEffect(() => {
    if (editOpen && mergeEditors && editor) {
      blockIndexRef.current = getCodeBlockIndex(editor, language, code);
    }
  }, [editOpen, mergeEditors, editor, language, code]);

  const handleMergeApply = useCallback((newEditCode: string, newCompareCode: string) => {
    if (!mergeEditors || !editor || blockIndexRef.current === -1) return;
    const isCompare = mergeEditors ? editor === mergeEditors.leftEditor : false;
    const otherEditor = isCompare ? mergeEditors.rightEditor : mergeEditors.leftEditor;

    // 比較エディタから開いた場合: editCode → 相手(rightEditor), compareCode → 自分(editor)
    // 編集エディタから開いた場合: editCode → 自分(editor), compareCode → 相手(leftEditor)
    const thisEditor = isCompare ? otherEditor : editor;
    const compareEditor = isCompare ? editor : otherEditor;
    const thisNewCode = newEditCode;
    const compareNewCode = newCompareCode;

    if (thisEditor) {
      const thisBlock = findCodeBlockByIndex(thisEditor, language, blockIndexRef.current);
      if (thisBlock) {
        thisEditor.chain().command(({ tr }) => {
          const from = thisBlock.pos + 1;
          const to = from + thisBlock.size;
          if (thisNewCode) tr.replaceWith(from, to, thisEditor.schema.text(thisNewCode));
          else tr.delete(from, to);
          return true;
        }).run();
      }
    }

    if (compareEditor) {
      const compareBlock = findCodeBlockByIndex(compareEditor, language, blockIndexRef.current);
      if (compareBlock) {
        compareEditor.chain().command(({ tr }) => {
          const from = compareBlock.pos + 1;
          const to = from + compareBlock.size;
          if (compareNewCode) tr.replaceWith(from, to, compareEditor.schema.text(compareNewCode));
          else tr.delete(from, to);
          return true;
        }).run();
      }
    }
  }, [mergeEditors, editor, language]);

  return { isCompareMode, compareCode, thisCode, handleMergeApply };
}
