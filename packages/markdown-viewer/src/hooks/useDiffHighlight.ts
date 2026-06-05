import type { Editor } from "@anytime-markdown/markdown-react";
import { useEffect } from "react";

import { computeBlockDiff } from "../utils/blockDiffComputation";

export function useDiffHighlight(
  sourceMode: boolean,
  rightEditor: Editor | null | undefined,
  leftEditor: Editor | null | undefined,
  semantic?: boolean,
  collapse?: boolean,
  contextBlocks?: number,
  expandLabel?: string,
): void {
  useEffect(() => {
    if (sourceMode) {
      requestAnimationFrame(() => {
        if (rightEditor && !rightEditor.isDestroyed) {
          rightEditor.commands.clearDiffHighlight();
        }
        if (leftEditor && !leftEditor.isDestroyed) {
          leftEditor.commands.clearDiffHighlight();
        }
      });
      return;
    }
    if (!rightEditor || !leftEditor) return;

    const updateHighlights = () => {
      if (rightEditor.isDestroyed || leftEditor.isDestroyed) return;
      const { left, right } = computeBlockDiff(
        rightEditor.state.doc,
        leftEditor.state.doc,
        { semantic },
      );
      requestAnimationFrame(() => {
        if (rightEditor.isDestroyed || leftEditor.isDestroyed) return;
        rightEditor.commands.setDiffHighlight(left, "left");
        leftEditor.commands.setDiffHighlight(right, "right");
      });
    };

    updateHighlights();
    rightEditor.on("update", updateHighlights);
    leftEditor.on("update", updateHighlights);

    return () => {
      rightEditor.off("update", updateHighlights);
      leftEditor.off("update", updateHighlights);
      requestAnimationFrame(() => {
        if (!rightEditor.isDestroyed) rightEditor.commands.clearDiffHighlight();
        if (!leftEditor.isDestroyed) leftEditor.commands.clearDiffHighlight();
      });
    };
  }, [sourceMode, rightEditor, leftEditor, semantic]);

  // 折りたたみ状態をプラグインへ反映（WYSIWYG のみ）
  useEffect(() => {
    const label = expandLabel ?? "Show {count} unchanged blocks";
    const ctx = contextBlocks ?? 1;
    const enabled = !sourceMode && !!collapse;
    requestAnimationFrame(() => {
      if (rightEditor && !rightEditor.isDestroyed) rightEditor.commands.setDiffCollapse(enabled, ctx, label);
      if (leftEditor && !leftEditor.isDestroyed) leftEditor.commands.setDiffCollapse(enabled, ctx, label);
    });
  }, [sourceMode, rightEditor, leftEditor, collapse, contextBlocks, expandLabel]);
}
