import { useState, useMemo, useCallback, useRef } from "react";
import { computeDiff, applyMerge, type DiffOptions, type DiffResult } from "../utils/diffEngine";

interface TextSnapshot {
  left: string;
  right: string;
}

export function useMergeDiff(onLeftTextChange?: (text: string) => void) {
  const [leftText, setLeftText] = useState("");
  const [rightText, setRightText] = useState("");
  const onLeftTextChangeRef = useRef(onLeftTextChange);
  onLeftTextChangeRef.current = onLeftTextChange;
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [diffOptions, setDiffOptions] = useState<DiffOptions>({});

  // Refs for latest values (enables stable callbacks without stale closures)
  const leftTextRef = useRef(leftText);
  leftTextRef.current = leftText;
  const rightTextRef = useRef(rightText);
  rightTextRef.current = rightText;

  // Undo/Redo history
  const undoStack = useRef<TextSnapshot[]>([]);
  const redoStack = useRef<TextSnapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0); // trigger re-render on history change

  const diffResult: DiffResult | null = useMemo(() => {
    if (leftText === "" && rightText === "") return null;
    return computeDiff(leftText, rightText, diffOptions);
  }, [leftText, rightText, diffOptions]);

  const diffResultRef = useRef<DiffResult | null>(diffResult);
  diffResultRef.current = diffResult;

  const totalBlocks = diffResult?.blocks.length ?? 0;

  // Clamp currentBlockIndex when blocks change
  const clampedIndex = totalBlocks === 0 ? 0 : Math.min(currentBlockIndex, totalBlocks - 1);
  if (clampedIndex !== currentBlockIndex) {
    setCurrentBlockIndex(clampedIndex);
  }

  const goToNextBlock = useCallback(() => {
    setCurrentBlockIndex((prev) => {
      if (totalBlocks === 0) return 0;
      return Math.min(prev + 1, totalBlocks - 1);
    });
  }, [totalBlocks]);

  const goToPrevBlock = useCallback(() => {
    setCurrentBlockIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const selectBlock = useCallback(
    (blockId: number) => {
      const dr = diffResultRef.current;
      if (!dr) return;
      const idx = dr.blocks.findIndex((b) => b.id === blockId);
      if (idx >= 0) setCurrentBlockIndex(idx);
    },
    [],
  );

  const pushUndo = useCallback(() => {
    undoStack.current.push({ left: leftTextRef.current, right: rightTextRef.current });
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const mergeBlock = useCallback(
    (blockId: number, direction: "left-to-right" | "right-to-left") => {
      const dr = diffResultRef.current;
      if (!dr) return;
      const block = dr.blocks.find((b) => b.id === blockId);
      if (!block) return;
      pushUndo();
      const { newLeftText, newRightText } = applyMerge(leftTextRef.current, rightTextRef.current, block, direction);
      setLeftText(newLeftText);
      setRightText(newRightText);
      if (newLeftText !== leftTextRef.current) onLeftTextChangeRef.current?.(newLeftText);
    },
    [pushUndo],
  );

  const mergeAllBlocks = useCallback(
    (direction: "left-to-right" | "right-to-left") => {
      pushUndo();
      if (direction === "left-to-right") {
        setRightText(leftTextRef.current);
      } else {
        const newLeft = rightTextRef.current;
        setLeftText(newLeft);
        if (newLeft !== leftTextRef.current) onLeftTextChangeRef.current?.(newLeft);
      }
    },
    [pushUndo],
  );

  const undo = useCallback(() => {
    const snapshot = undoStack.current.pop();
    if (!snapshot) return;
    redoStack.current.push({ left: leftTextRef.current, right: rightTextRef.current });
    setLeftText(snapshot.left);
    setRightText(snapshot.right);
    setHistoryVersion((v) => v + 1);
    if (snapshot.left !== leftTextRef.current) onLeftTextChangeRef.current?.(snapshot.left);
  }, []);

  const redo = useCallback(() => {
    const snapshot = redoStack.current.pop();
    if (!snapshot) return;
    undoStack.current.push({ left: leftTextRef.current, right: rightTextRef.current });
    setLeftText(snapshot.left);
    setRightText(snapshot.right);
    setHistoryVersion((v) => v + 1);
    if (snapshot.left !== leftTextRef.current) onLeftTextChangeRef.current?.(snapshot.left);
  }, []);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  const _hv = historyVersion; // ensure re-render on history change

  return {
    leftText,
    rightText,
    setLeftText,
    setRightText,
    diffResult,
    diffOptions,
    setDiffOptions,
    currentBlockIndex: clampedIndex,
    totalBlocks,
    goToNextBlock,
    goToPrevBlock,
    mergeBlock,
    mergeAllBlocks,
    selectBlock,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
