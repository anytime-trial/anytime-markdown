"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import { useCallback, useEffect, useRef, useState } from "react";

import { type TextareaSearchState, useTextareaSearch } from "@anytime-markdown/markdown-viewer";

/**
 * codeBlock の全画面編集状態（fsCode / dirty / 検索置換 / apply / discard）を
 * 選択中ブロックに対して管理するフック。ダイアログ host（`CodeDialogHost`）が
 * 旧 `CodeBlockNodeView`（MermaidNodeView）から移設したロジックを保持する。
 *
 * apply は選択中ブロックの `pos` を使い、コードテキストを一括 replaceWith する
 * （旧 `handleFsApply` と等価）。
 */

/**
 * 選択中 codeBlock のコードテキストを fsCode へ一括反映する（純関数）。
 * 空文字なら範囲削除。`from = pos + 1`、`to = from + contentSize`。
 */
export function applyCodeBlockText(editor: Editor, pos: number, contentSize: number, fsCode: string): void {
  const from = pos + 1;
  const to = from + contentSize;
  editor.chain().command(({ tr }) => {
    if (fsCode) {
      tr.replaceWith(from, to, editor.schema.text(fsCode));
    } else {
      tr.delete(from, to);
    }
    return true;
  }).run();
}

export interface CodeBlockEditState {
  code: string;
  fsCode: string;
  fsDirty: boolean;
  fsTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fsSearch: TextareaSearchState;
  onFsCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFsTextChange: (newCode: string) => void;
  onApply: () => void;
  tryCloseEdit: () => void;
  discardOpen: boolean;
  setDiscardOpen: (open: boolean) => void;
  handleDiscardConfirm: () => void;
  handleCopyCode: () => void;
}

export function useCodeBlockEdit(
  editor: Editor | null,
  pos: number,
  node: PMNode | null,
  editOpen: boolean,
  setEditOpen: (open: boolean) => void,
): CodeBlockEditState {
  const code = node?.textContent ?? "";
  const [fsCode, setFsCode] = useState("");
  const [fsDirty, setFsDirty] = useState(false);
  const originalCodeRef = useRef("");
  const fsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  // editOpen を開いた瞬間に現在のコードをスナップショットする（code は意図的に依存外）。
  useEffect(() => {
    if (editOpen) {
      setFsCode(code);
      originalCodeRef.current = code;
      setFsDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen]);

  const onFsTextChange = useCallback((v: string) => {
    setFsCode(v);
    setFsDirty(v !== originalCodeRef.current);
  }, []);

  const onFsCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => onFsTextChange(e.target.value),
    [onFsTextChange],
  );

  const onApply = useCallback(() => {
    if (!editor || pos < 0 || !node) return;
    applyCodeBlockText(editor, pos, node.content.size, fsCode);
    originalCodeRef.current = fsCode;
    setFsDirty(false);
    setEditOpen(false);
  }, [editor, pos, node, fsCode, setEditOpen]);

  const tryCloseEdit = useCallback(() => {
    if (fsDirty) setDiscardOpen(true);
    else setEditOpen(false);
  }, [fsDirty, setEditOpen]);

  const handleDiscardConfirm = useCallback(() => {
    setDiscardOpen(false);
    setFsDirty(false);
    setEditOpen(false);
  }, [setEditOpen]);

  const fsSearch = useTextareaSearch(fsTextareaRef, fsCode, onFsTextChange);

  const handleCopyCode = useCallback(() => {
    void navigator.clipboard?.writeText(code);
  }, [code]);

  return {
    code, fsCode, fsDirty, fsTextareaRef, fsSearch,
    onFsCodeChange, onFsTextChange, onApply, tryCloseEdit,
    discardOpen, setDiscardOpen, handleDiscardConfirm, handleCopyCode,
  };
}
