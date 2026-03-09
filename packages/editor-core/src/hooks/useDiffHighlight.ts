import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { computeBlockDiff } from "../extensions/diffHighlight";

export function useDiffHighlight(
  sourceMode: boolean,
  leftEditor: Editor | null | undefined,
  rightEditor: Editor | null | undefined,
): void {
  useEffect(() => {
    if (sourceMode) {
      // ソースモードではクリア（行単位ハイライトを使用）
      // React レンダリング中の flushSync 競合を回避するため次フレームに遅延
      requestAnimationFrame(() => {
        if (leftEditor && !leftEditor.isDestroyed) {
          leftEditor.commands.clearDiffHighlight();
        }
        if (rightEditor && !rightEditor.isDestroyed) {
          rightEditor.commands.clearDiffHighlight();
        }
      });
      return;
    }
    if (!leftEditor || !rightEditor) return;

    const updateHighlights = () => {
      if (leftEditor.isDestroyed || rightEditor.isDestroyed) return;
      const { left, right } = computeBlockDiff(
        leftEditor.state.doc,
        rightEditor.state.doc,
      );
      requestAnimationFrame(() => {
        if (leftEditor.isDestroyed || rightEditor.isDestroyed) return;
        leftEditor.commands.setDiffHighlight(left, "left");
        rightEditor.commands.setDiffHighlight(right, "right");
      });
    };

    updateHighlights();
    leftEditor.on("update", updateHighlights);
    rightEditor.on("update", updateHighlights);

    return () => {
      leftEditor.off("update", updateHighlights);
      rightEditor.off("update", updateHighlights);
      // React レンダリング中の flushSync 競合を回避するため次フレームに遅延
      requestAnimationFrame(() => {
        if (!leftEditor.isDestroyed) leftEditor.commands.clearDiffHighlight();
        if (!rightEditor.isDestroyed) rightEditor.commands.clearDiffHighlight();
      });
    };
  }, [sourceMode, leftEditor, rightEditor]);
}
