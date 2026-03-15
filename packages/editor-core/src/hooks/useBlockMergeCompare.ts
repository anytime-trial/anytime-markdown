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
  handleMergeApply: (newThisCode: string, newOtherCode: string) => void;
} {
  const { editor, language, code, editOpen } = params;

  const mergeEditors = getMergeEditors();
  const isCompareMode = !!mergeEditors;

  const compareCode = useMemo(() => {
    if (!editOpen || !mergeEditors || !editor) return null;
    const isRight = !!editor.view?.dom?.dataset?.reviewMode;
    const otherEditor = isRight ? mergeEditors.leftEditor : mergeEditors.rightEditor;
    return findCounterpartCode(editor, otherEditor, language, code);
  }, [editOpen, mergeEditors, editor, language, code]);

  const blockIndexRef = useRef(-1);
  useEffect(() => {
    if (editOpen && mergeEditors && editor) {
      blockIndexRef.current = getCodeBlockIndex(editor, language, code);
    }
  }, [editOpen, mergeEditors, editor, language, code]);

  const handleMergeApply = useCallback((newThisCode: string, newOtherCode: string) => {
    if (!mergeEditors || !editor || blockIndexRef.current === -1) return;
    const isRight = !!editor.view?.dom?.dataset?.reviewMode;
    const otherEditor = isRight ? mergeEditors.leftEditor : mergeEditors.rightEditor;

    const thisBlock = findCodeBlockByIndex(editor, language, blockIndexRef.current);
    if (thisBlock) {
      editor.chain().command(({ tr }) => {
        const from = thisBlock.pos + 1;
        const to = from + thisBlock.size;
        if (newThisCode) tr.replaceWith(from, to, editor.schema.text(newThisCode));
        else tr.delete(from, to);
        return true;
      }).run();
    }

    if (otherEditor) {
      const otherBlock = findCodeBlockByIndex(otherEditor, language, blockIndexRef.current);
      if (otherBlock) {
        otherEditor.chain().command(({ tr }) => {
          const from = otherBlock.pos + 1;
          const to = from + otherBlock.size;
          if (newOtherCode) tr.replaceWith(from, to, otherEditor.schema.text(newOtherCode));
          else tr.delete(from, to);
          return true;
        }).run();
      }
    }
  }, [mergeEditors, editor, language]);

  return { isCompareMode, compareCode, handleMergeApply };
}
