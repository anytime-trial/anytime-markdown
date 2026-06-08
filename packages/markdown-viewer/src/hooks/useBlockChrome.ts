"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import { useCallback, useState } from "react";

import { type SelectedBlock, useSelectedBlock } from "./useSelectedBlock";

export interface BlockChrome extends SelectedBlock {
  /** 削除確認ダイアログの開閉状態。 */
  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  /** 削除を実行してダイアログを閉じる。 */
  handleDelete: () => void;
  /** ツールバーを表示してよいか（editor 有り・対象ブロック選択中・編集可能）。 */
  showToolbar: boolean;
}

/**
 * ブロック編集オーバーレイ共通のシェル。{@link useSelectedBlock} に加え、全オーバーレイで
 * 一致する削除ダイアログ状態・削除ハンドラ・ツールバー表示判定をまとめる。
 *
 * 各オーバーレイ（gif / image / table / code …）はこれを呼び、ブロック固有のツールバー
 * アクションと編集ダイアログだけを実装すればよい。ブロック固有の表示抑制（例: table の
 * スプレッドシート編集中はツールバー非表示）は `showToolbar && !editOpen` のように
 * 呼び出し側で合成する。
 */
export function useBlockChrome(
  editor: Editor | null,
  nodeTypeName: string,
): BlockChrome {
  const block = useSelectedBlock(editor, nodeTypeName);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { deleteBlock } = block;
  const handleDelete = useCallback(() => {
    deleteBlock();
    setDeleteOpen(false);
  }, [deleteBlock]);

  const showToolbar = !!editor && !!block.node && editor.isEditable;

  return { ...block, deleteOpen, setDeleteOpen, handleDelete, showToolbar };
}
