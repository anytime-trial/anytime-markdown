import type { Editor } from "@anytime-markdown/markdown-react";
import { useEffect } from "react";

import { computeBlockCollapsePlan, computeBlockDiff } from "../utils/blockDiffComputation";

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
        if (rightEditor && !rightEditor.isDestroyed) rightEditor.commands.clearDiffHighlight();
        if (leftEditor && !leftEditor.isDestroyed) leftEditor.commands.clearDiffHighlight();
      });
      return;
    }
    if (!rightEditor || !leftEditor) return;

    const label = expandLabel ?? "Show {count} unchanged blocks";
    const ctx = contextBlocks ?? 1;

    const update = () => {
      if (rightEditor.isDestroyed || leftEditor.isDestroyed) return;
      const { left, right } = computeBlockDiff(rightEditor.state.doc, leftEditor.state.doc, { semantic });
      // 左右ブロックを共有アラインメントで畳むため、両 doc から一括で計画を作る
      const plan = collapse ? computeBlockCollapsePlan(rightEditor.state.doc, leftEditor.state.doc, ctx) : null;
      requestAnimationFrame(() => {
        if (rightEditor.isDestroyed || leftEditor.isDestroyed) return;
        rightEditor.commands.setDiffHighlight(left, "left");
        leftEditor.commands.setDiffHighlight(right, "right");
        rightEditor.commands.setCollapsePlan(plan ? plan.aRuns : [], label);
        leftEditor.commands.setCollapsePlan(plan ? plan.bRuns : [], label);
      });
    };

    update();
    rightEditor.on("update", update);
    leftEditor.on("update", update);

    return () => {
      rightEditor.off("update", update);
      leftEditor.off("update", update);
      requestAnimationFrame(() => {
        if (!rightEditor.isDestroyed) rightEditor.commands.clearDiffHighlight();
        if (!leftEditor.isDestroyed) leftEditor.commands.clearDiffHighlight();
      });
    };
  }, [sourceMode, rightEditor, leftEditor, semantic, collapse, contextBlocks, expandLabel]);
}
