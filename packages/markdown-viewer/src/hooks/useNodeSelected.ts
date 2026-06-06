"use client";

import type { NodeViewProps } from "@anytime-markdown/markdown-react";
import { useEditorState } from "@anytime-markdown/markdown-react";

import { isSelectionWithinNode } from "../utils/nodeSelection";

/**
 * Detect whether the editor selection is within this node view.
 *
 * doc 差し替え（ファイル選択・比較表示）で detached になったノードに対しても
 * getPos() の throw を吸収する。判定本体は isSelectionWithinNode（純粋関数）に委譲。
 */
export function useNodeSelected(
  editor: NodeViewProps["editor"],
  getPos: NodeViewProps["getPos"],
  nodeSize: number,
): boolean {
  return useEditorState({
    editor,
    selector: (ctx) => isSelectionWithinNode(ctx.editor, getPos, nodeSize),
  });
}
