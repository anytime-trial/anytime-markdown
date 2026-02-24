import { diffLines, diffWords, type Change } from "diff";

// --- Type definitions ---

export interface DiffBlock {
  id: number;
  type: "added" | "removed" | "modified";
  leftStartLine: number;
  leftEndLine: number;
  rightStartLine: number;
  rightEndLine: number;
  leftLines: string[];
  rightLines: string[];
}

export interface DiffLine {
  text: string;
  type: "equal" | "added" | "removed" | "modified-old" | "modified-new" | "padding";
  blockId: number | null;
  lineNumber: number | null;
}

export interface DiffResult {
  leftLines: DiffLine[];
  rightLines: DiffLine[];
  blocks: DiffBlock[];
}

// --- Diff options (E-3) ---

export interface DiffOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  ignoreBlankLines?: boolean;
}

// --- Helpers ---

function splitLines(text: string): string[] {
  if (text === "") return [];
  // Keep trailing empty line if text ends with newline
  const lines = text.split("\n");
  // diffLines operates on text with trailing newlines, so we trim the last empty entry
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

// --- Core functions ---

export function computeDiff(leftText: string, rightText: string, options?: DiffOptions): DiffResult {
  const opts = options ?? {};

  // Normalize text for comparison (E-3: filtering)
  let compareLeft = leftText;
  let compareRight = rightText;
  if (opts.ignoreWhitespace || opts.ignoreCase) {
    const normalize = (text: string) => {
      let lines = text.split("\n");
      if (opts.ignoreWhitespace) lines = lines.map((l) => l.trimEnd());
      if (opts.ignoreCase) lines = lines.map((l) => l.toLowerCase());
      return lines.join("\n");
    };
    compareLeft = normalize(leftText);
    compareRight = normalize(rightText);
  }

  const changes: Change[] = diffLines(compareLeft, compareRight);

  // Original lines for display (use original text, not normalized)
  const origLeftLines = splitLines(leftText);
  const origRightLines = splitLines(rightText);

  // Step 1: Merge adjacent removed+added into modified, mapping back to original lines via count
  interface MergedChange {
    type: "equal" | "added" | "removed" | "modified";
    leftLines: string[];
    rightLines: string[];
  }

  const merged: MergedChange[] = [];
  let leftIdx = 0;
  let rightIdx = 0;

  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const count = c.count ?? 0;
    if (c.removed && i + 1 < changes.length && changes[i + 1].added) {
      const nextCount = changes[i + 1].count ?? 0;
      merged.push({
        type: "modified",
        leftLines: origLeftLines.slice(leftIdx, leftIdx + count),
        rightLines: origRightLines.slice(rightIdx, rightIdx + nextCount),
      });
      leftIdx += count;
      rightIdx += nextCount;
      i++; // skip next
    } else if (c.added) {
      merged.push({
        type: "added",
        leftLines: [],
        rightLines: origRightLines.slice(rightIdx, rightIdx + count),
      });
      rightIdx += count;
    } else if (c.removed) {
      merged.push({
        type: "removed",
        leftLines: origLeftLines.slice(leftIdx, leftIdx + count),
        rightLines: [],
      });
      leftIdx += count;
    } else {
      merged.push({
        type: "equal",
        leftLines: origLeftLines.slice(leftIdx, leftIdx + count),
        rightLines: origRightLines.slice(rightIdx, rightIdx + count),
      });
      leftIdx += count;
      rightIdx += count;
    }
  }

  // Step 1.5: Post-process — ignore blank-line-only diffs
  if (opts.ignoreBlankLines) {
    for (let i = 0; i < merged.length; i++) {
      const m = merged[i];
      if (m.type === "equal") continue;

      const allBlank = [...m.leftLines, ...m.rightLines].every((l) => l.trim() === "");
      if (allBlank) {
        const maxLen = Math.max(m.leftLines.length, m.rightLines.length);
        const paddedLeft = [...m.leftLines];
        const paddedRight = [...m.rightLines];
        while (paddedLeft.length < maxLen) paddedLeft.push("");
        while (paddedRight.length < maxLen) paddedRight.push("");
        merged[i] = { type: "equal", leftLines: paddedLeft, rightLines: paddedRight };
      }
    }
  }

  // Step 2: Build DiffLine arrays and DiffBlock list
  const leftLines: DiffLine[] = [];
  const rightLines: DiffLine[] = [];
  const blocks: DiffBlock[] = [];
  let leftLineNum = 0;
  let rightLineNum = 0;
  let blockId = 0;

  for (const m of merged) {
    if (m.type === "equal") {
      for (let ei = 0; ei < m.leftLines.length; ei++) {
        leftLines.push({ text: m.leftLines[ei], type: "equal", blockId: null, lineNumber: leftLineNum + 1 });
        rightLines.push({ text: m.rightLines[ei] ?? m.leftLines[ei], type: "equal", blockId: null, lineNumber: rightLineNum + 1 });
        leftLineNum++;
        rightLineNum++;
      }
    } else {
      const currentBlockId = blockId++;
      const leftStart = leftLineNum;
      const rightStart = rightLineNum;

      if (m.type === "modified") {
        const maxLen = Math.max(m.leftLines.length, m.rightLines.length);
        for (let i = 0; i < maxLen; i++) {
          if (i < m.leftLines.length) {
            leftLines.push({ text: m.leftLines[i], type: "modified-old", blockId: currentBlockId, lineNumber: leftLineNum + 1 });
            leftLineNum++;
          } else {
            leftLines.push({ text: "", type: "padding", blockId: currentBlockId, lineNumber: null });
          }
          if (i < m.rightLines.length) {
            rightLines.push({ text: m.rightLines[i], type: "modified-new", blockId: currentBlockId, lineNumber: rightLineNum + 1 });
            rightLineNum++;
          } else {
            rightLines.push({ text: "", type: "padding", blockId: currentBlockId, lineNumber: null });
          }
        }
      } else if (m.type === "added") {
        for (const line of m.rightLines) {
          leftLines.push({ text: "", type: "padding", blockId: currentBlockId, lineNumber: null });
          rightLines.push({ text: line, type: "added", blockId: currentBlockId, lineNumber: rightLineNum + 1 });
          rightLineNum++;
        }
      } else {
        // removed
        for (const line of m.leftLines) {
          leftLines.push({ text: line, type: "removed", blockId: currentBlockId, lineNumber: leftLineNum + 1 });
          rightLines.push({ text: "", type: "padding", blockId: currentBlockId, lineNumber: null });
          leftLineNum++;
        }
      }

      blocks.push({
        id: currentBlockId,
        type: m.type as "added" | "removed" | "modified",
        leftStartLine: leftStart,
        leftEndLine: leftLineNum,
        rightStartLine: rightStart,
        rightEndLine: rightLineNum,
        leftLines: m.leftLines,
        rightLines: m.rightLines,
      });
    }
  }

  return { leftLines, rightLines, blocks };
}

// --- Inline diff ---

export interface InlineSegment {
  text: string;
  type: "equal" | "added" | "removed";
}

/**
 * Compute word-level inline diff between two lines.
 * Returns segments for old line and new line separately.
 */
export function computeInlineDiff(
  oldText: string,
  newText: string,
): { oldSegments: InlineSegment[]; newSegments: InlineSegment[] } {
  const changes = diffWords(oldText, newText);
  const oldSegments: InlineSegment[] = [];
  const newSegments: InlineSegment[] = [];

  for (const c of changes) {
    if (c.added) {
      newSegments.push({ text: c.value, type: "added" });
    } else if (c.removed) {
      oldSegments.push({ text: c.value, type: "removed" });
    } else {
      oldSegments.push({ text: c.value, type: "equal" });
      newSegments.push({ text: c.value, type: "equal" });
    }
  }

  return { oldSegments, newSegments };
}

export function applyMerge(
  leftText: string,
  rightText: string,
  block: DiffBlock,
  direction: "left-to-right" | "right-to-left",
): { newLeftText: string; newRightText: string } {
  const leftArr = leftText === "" ? [] : leftText.split("\n");
  const rightArr = rightText === "" ? [] : rightText.split("\n");

  if (direction === "left-to-right") {
    // Replace right side lines with left side lines
    rightArr.splice(block.rightStartLine, block.rightEndLine - block.rightStartLine, ...block.leftLines);
  } else {
    // Replace left side lines with right side lines
    leftArr.splice(block.leftStartLine, block.leftEndLine - block.leftStartLine, ...block.rightLines);
  }

  return {
    newLeftText: leftArr.join("\n"),
    newRightText: rightArr.join("\n"),
  };
}
