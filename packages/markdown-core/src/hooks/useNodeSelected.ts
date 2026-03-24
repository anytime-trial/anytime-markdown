"use client";

import type { NodeViewProps } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";

/**
 * Detect whether the editor selection is within this node view.
 */
export function useNodeSelected(
  editor: NodeViewProps["editor"],
  getPos: NodeViewProps["getPos"],
  nodeSize: number,
): boolean {
  return useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor || typeof getPos !== "function") return false;
      const pos = getPos();
      if (pos == null) return false;
      const from = ctx.editor.state.selection.from;
      return from >= pos && from <= pos + nodeSize;
    },
  });
}
