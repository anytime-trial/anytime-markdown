"use client";

import type { NodeViewProps } from "@tiptap/react";
import { useCallback } from "react";

/**
 * Return a callback that deletes the current node view block.
 */
export function useDeleteBlock(
  editor: NodeViewProps["editor"],
  getPos: NodeViewProps["getPos"],
  nodeSize: number,
): () => void {
  return useCallback(() => {
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    editor.chain().focus().command(({ tr }) => { tr.delete(pos, pos + nodeSize); return true; }).run();
  }, [editor, getPos, nodeSize]);
}
