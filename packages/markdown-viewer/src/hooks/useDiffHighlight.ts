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

    // dispatch 用にスケジュール済みの rAF。editor 差し替え・unmount 時にキャンセルし、
    // 旧 doc 由来の diff を差し替え後の editor へ流す stale dispatch を防ぐ。
    let pendingRaf = 0;

    const update = () => {
      if (rightEditor.isDestroyed || leftEditor.isDestroyed) return;
      const { left, right } = computeBlockDiff(rightEditor.state.doc, leftEditor.state.doc, { semantic });
      // 左右ブロックを共有アラインメントで畳むため、両 doc から一括で計画を作る
      const plan = collapse ? computeBlockCollapsePlan(rightEditor.state.doc, leftEditor.state.doc, ctx) : null;
      cancelAnimationFrame(pendingRaf); // 連続 update で前回の dispatch が残らないようにする
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = 0;
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
      cancelAnimationFrame(pendingRaf); // pending dispatch を破棄（stale dispatch 防止）
      rightEditor.off("update", update);
      leftEditor.off("update", update);
      requestAnimationFrame(() => {
        if (!rightEditor.isDestroyed) rightEditor.commands.clearDiffHighlight();
        if (!leftEditor.isDestroyed) leftEditor.commands.clearDiffHighlight();
      });
    };
  }, [sourceMode, rightEditor, leftEditor, semantic, collapse, contextBlocks, expandLabel]);
}
