import type { NodeViewProps } from "@tiptap/react";
import { useState } from "react";

import { useDeleteBlock } from "./useDeleteBlock";
import { useNodeSelected } from "./useNodeSelected";

interface UseBlockNodeStateReturn {
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  collapsed: boolean;
  isEditable: boolean;
  isSelected: boolean;
  handleDeleteBlock: () => void;
  showToolbar: boolean;
}

/**
 * ブロック要素 NodeView の共通ステート。
 * 削除ダイアログ、編集画面、折りたたみ、選択状態、ツールバー表示を管理。
 */
export function useBlockNodeState(
  editor: NodeViewProps["editor"],
  node: NodeViewProps["node"],
  getPos: NodeViewProps["getPos"],
): UseBlockNodeStateReturn {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const collapsed = !!node.attrs.collapsed;
  const isEditable = editor?.isEditable ?? true;
  const isSelected = useNodeSelected(editor, getPos, node.nodeSize);
  const handleDeleteBlock = useDeleteBlock(editor, getPos, node.nodeSize);
  const showToolbar = isEditable && (collapsed || editOpen || isSelected);

  return {
    deleteDialogOpen, setDeleteDialogOpen,
    editOpen, setEditOpen,
    collapsed, isEditable, isSelected,
    handleDeleteBlock, showToolbar,
  };
}
