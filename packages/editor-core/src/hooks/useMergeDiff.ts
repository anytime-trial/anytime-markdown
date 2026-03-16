import { useCallback, useMemo, useRef,useState } from "react";

import { applyMerge, computeDiff, type DiffOptions, type DiffResult } from "../utils/diffEngine";

interface TextSnapshot {
  edit: string;
  compare: string;
}

export function useMergeDiff(onEditTextChange?: (text: string) => void) {
  const [editText, setEditText] = useState("");
  const [compareText, setCompareText] = useState("");
  const onEditTextChangeRef = useRef(onEditTextChange);
  onEditTextChangeRef.current = onEditTextChange;
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [diffOptions, setDiffOptions] = useState<DiffOptions>({});

  // Refs for latest values (enables stable callbacks without stale closures)
  const editTextRef = useRef(editText);
  editTextRef.current = editText;
  const compareTextRef = useRef(compareText);
  compareTextRef.current = compareText;

  // Undo/Redo history
  const undoStack = useRef<TextSnapshot[]>([]);
  const redoStack = useRef<TextSnapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0); // trigger re-render on history change

  const diffResult: DiffResult | null = useMemo(() => {
    if (editText === "" && compareText === "") return null;
    return computeDiff(editText, compareText, diffOptions);
  }, [editText, compareText, diffOptions]);

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
    undoStack.current.push({ edit: editTextRef.current, compare: compareTextRef.current });
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
      const { newLeftText, newRightText } = applyMerge(editTextRef.current, compareTextRef.current, block, direction);
      setEditText(newLeftText);
      setCompareText(newRightText);
      if (newLeftText !== editTextRef.current) onEditTextChangeRef.current?.(newLeftText);
    },
    [pushUndo],
  );

  const mergeAllBlocks = useCallback(
    (direction: "left-to-right" | "right-to-left") => {
      pushUndo();
      if (direction === "left-to-right") {
        setCompareText(editTextRef.current);
      } else {
        const newEdit = compareTextRef.current;
        setEditText(newEdit);
        if (newEdit !== editTextRef.current) onEditTextChangeRef.current?.(newEdit);
      }
    },
    [pushUndo],
  );

  const undo = useCallback(() => {
    const snapshot = undoStack.current.pop();
    if (!snapshot) return;
    redoStack.current.push({ edit: editTextRef.current, compare: compareTextRef.current });
    setEditText(snapshot.edit);
    setCompareText(snapshot.compare);
    setHistoryVersion((v) => v + 1);
    if (snapshot.edit !== editTextRef.current) onEditTextChangeRef.current?.(snapshot.edit);
  }, []);

  const redo = useCallback(() => {
    const snapshot = redoStack.current.pop();
    if (!snapshot) return;
    undoStack.current.push({ edit: editTextRef.current, compare: compareTextRef.current });
    setEditText(snapshot.edit);
    setCompareText(snapshot.compare);
    setHistoryVersion((v) => v + 1);
    if (snapshot.edit !== editTextRef.current) onEditTextChangeRef.current?.(snapshot.edit);
  }, []);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  const _hv = historyVersion; // ensure re-render on history change

  return {
    editText,
    compareText,
    setEditText,
    setCompareText,
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
