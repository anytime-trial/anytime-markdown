import { type Change,diffLines, diffWords } from "diff";

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
  semantic?: boolean;
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

export interface MergedChange {
  type: "equal" | "added" | "removed" | "modified";
  leftLines: string[];
  rightLines: string[];
}

/** Normalize text for comparison based on diff options */
export function normalizeForComparison(leftText: string, rightText: string, opts: DiffOptions): { compareLeft: string; compareRight: string } {
  if (!opts.ignoreWhitespace && !opts.ignoreCase) {
    return { compareLeft: leftText, compareRight: rightText };
  }
  const normalize = (text: string) => {
    let lines = text.split("\n");
    if (opts.ignoreWhitespace) lines = lines.map((l) => l.trimEnd());
    if (opts.ignoreCase) lines = lines.map((l) => l.toLowerCase());
    return lines.join("\n");
  };
  return { compareLeft: normalize(leftText), compareRight: normalize(rightText) };
}

/** Merge adjacent removed+added changes into modified, mapping back to original lines */
export function mergeAdjacentChanges(changes: Change[], origLeftLines: string[], origRightLines: string[]): MergedChange[] {
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
      merged.push({ type: "added", leftLines: [], rightLines: origRightLines.slice(rightIdx, rightIdx + count) });
      rightIdx += count;
    } else if (c.removed) {
      merged.push({ type: "removed", leftLines: origLeftLines.slice(leftIdx, leftIdx + count), rightLines: [] });
      leftIdx += count;
    } else {
      merged.push({ type: "equal", leftLines: origLeftLines.slice(leftIdx, leftIdx + count), rightLines: origRightLines.slice(rightIdx, rightIdx + count) });
      leftIdx += count;
      rightIdx += count;
    }
  }
  return merged;
}

/** Post-process: convert blank-line-only diffs to equal */
export function neutralizeBlankLineDiffs(merged: MergedChange[]): void {
  for (let i = 0; i < merged.length; i++) {
    const m = merged[i];
    if (m.type === "equal") continue;
    const allBlank = [...m.leftLines, ...m.rightLines].every((l) => l.trim() === "");
    if (!allBlank) continue;
    const maxLen = Math.max(m.leftLines.length, m.rightLines.length);
    const paddedLeft = [...m.leftLines];
    const paddedRight = [...m.rightLines];
    while (paddedLeft.length < maxLen) paddedLeft.push("");
    while (paddedRight.length < maxLen) paddedRight.push("");
    merged[i] = { type: "equal", leftLines: paddedLeft, rightLines: paddedRight };
  }
}

/** Append equal lines to DiffLine arrays */
function appendEqualLines(
  m: MergedChange, leftLines: DiffLine[], rightLines: DiffLine[],
  leftLineNum: number, rightLineNum: number,
): { leftLineNum: number; rightLineNum: number } {
  for (let ei = 0; ei < m.leftLines.length; ei++) {
    leftLines.push({ text: m.leftLines[ei], type: "equal", blockId: null, lineNumber: leftLineNum + 1 });
    rightLines.push({ text: m.rightLines[ei] ?? m.leftLines[ei], type: "equal", blockId: null, lineNumber: rightLineNum + 1 });
    leftLineNum++;
    rightLineNum++;
  }
  return { leftLineNum, rightLineNum };
}

/** Append modified block lines (modified/added/removed) to DiffLine arrays */
function appendModifiedBlock(
  m: MergedChange, blockId: number, leftLines: DiffLine[], rightLines: DiffLine[],
  leftLineNum: number, rightLineNum: number,
): { leftLineNum: number; rightLineNum: number } {
  if (m.type === "modified") {
    return appendModifiedLines(m, blockId, leftLines, rightLines, leftLineNum, rightLineNum);
  }
  if (m.type === "added") {
    return appendAddedLines(m, blockId, leftLines, rightLines, rightLineNum);
  }
  // removed
  return appendRemovedLines(m, blockId, leftLines, rightLines, leftLineNum);
}

function appendModifiedLines(
  m: MergedChange, blockId: number, leftLines: DiffLine[], rightLines: DiffLine[],
  leftLineNum: number, rightLineNum: number,
): { leftLineNum: number; rightLineNum: number } {
  const maxLen = Math.max(m.leftLines.length, m.rightLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < m.leftLines.length) {
      leftLines.push({ text: m.leftLines[i], type: "modified-old", blockId, lineNumber: leftLineNum + 1 });
      leftLineNum++;
    } else {
      leftLines.push({ text: "", type: "padding", blockId, lineNumber: null });
    }
    if (i < m.rightLines.length) {
      rightLines.push({ text: m.rightLines[i], type: "modified-new", blockId, lineNumber: rightLineNum + 1 });
      rightLineNum++;
    } else {
      rightLines.push({ text: "", type: "padding", blockId, lineNumber: null });
    }
  }
  return { leftLineNum, rightLineNum };
}

function appendAddedLines(
  m: MergedChange, blockId: number, leftLines: DiffLine[], rightLines: DiffLine[],
  rightLineNum: number,
): { leftLineNum: number; rightLineNum: number } {
  for (const line of m.rightLines) {
    leftLines.push({ text: "", type: "padding", blockId, lineNumber: null });
    rightLines.push({ text: line, type: "added", blockId, lineNumber: rightLineNum + 1 });
    rightLineNum++;
  }
  return { leftLineNum: -1, rightLineNum }; // leftLineNum unused by caller for "added"
}

function appendRemovedLines(
  m: MergedChange, blockId: number, leftLines: DiffLine[], rightLines: DiffLine[],
  leftLineNum: number,
): { leftLineNum: number; rightLineNum: number } {
  for (const line of m.leftLines) {
    leftLines.push({ text: line, type: "removed", blockId, lineNumber: leftLineNum + 1 });
    rightLines.push({ text: "", type: "padding", blockId, lineNumber: null });
    leftLineNum++;
  }
  return { leftLineNum, rightLineNum: -1 }; // rightLineNum unused by caller for "removed"
}

/** Build DiffLine arrays and DiffBlock list from merged changes */
function buildDiffResult(merged: MergedChange[]): DiffResult {
  const leftLines: DiffLine[] = [];
  const rightLines: DiffLine[] = [];
  const blocks: DiffBlock[] = [];
  let leftLineNum = 0;
  let rightLineNum = 0;
  let blockId = 0;

  for (const m of merged) {
    if (m.type === "equal") {
      ({ leftLineNum, rightLineNum } = appendEqualLines(m, leftLines, rightLines, leftLineNum, rightLineNum));
    } else {
      const currentBlockId = blockId++;
      const leftStart = leftLineNum;
      const rightStart = rightLineNum;

      const result = appendModifiedBlock(m, currentBlockId, leftLines, rightLines, leftLineNum, rightLineNum);
      if (m.type !== "added") leftLineNum = result.leftLineNum;
      if (m.type !== "removed") rightLineNum = result.rightLineNum;

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

export function computeDiff(leftText: string, rightText: string, options?: DiffOptions): DiffResult {
  const opts = options ?? {};

  const { compareLeft, compareRight } = normalizeForComparison(leftText, rightText, opts);
  const changes: Change[] = diffLines(compareLeft, compareRight);

  const origLeftLines = splitLines(leftText);
  const origRightLines = splitLines(rightText);

  const merged = mergeAdjacentChanges(changes, origLeftLines, origRightLines);

  if (opts.ignoreBlankLines) {
    neutralizeBlankLineDiffs(merged);
  }

  return buildDiffResult(merged);
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

// --- Semantic diff (heading-based) ---

import { type MarkdownSection,matchSections, parseMarkdownSections } from "./sectionParser";

export function computeSemanticDiff(leftText: string, rightText: string, options?: DiffOptions): DiffResult {
  if (leftText === "" && rightText === "") {
    return { leftLines: [], rightLines: [], blocks: [] };
  }

  const leftSections = parseMarkdownSections(leftText);
  const rightSections = parseMarkdownSections(rightText);

  // 見出しが片方にもない場合はフォールバック
  const leftHasHeadings = leftSections.some(s => s.heading !== null);
  const rightHasHeadings = rightSections.some(s => s.heading !== null);
  if (!leftHasHeadings && !rightHasHeadings) {
    return computeDiff(leftText, rightText, options);
  }

  const allLeftLines: DiffLine[] = [];
  const allRightLines: DiffLine[] = [];
  const allBlocks: DiffBlock[] = [];
  let blockIdCounter = 0;

  const matches = matchSections(leftSections, rightSections);

  for (const match of matches) {
    blockIdCounter = processMatch(match, allLeftLines, allRightLines, allBlocks, blockIdCounter, options);
  }

  return { leftLines: allLeftLines, rightLines: allRightLines, blocks: allBlocks };
}

function sectionToText(section: MarkdownSection): string {
  const lines: string[] = [];
  collectSectionLines(section, lines);
  return lines.join("\n");
}

function collectSectionLines(section: MarkdownSection, out: string[]): void {
  if (section.headingLine) out.push(section.headingLine);
  out.push(...section.bodyLines);
  for (const child of section.children) {
    collectSectionLines(child, out);
  }
}

function sectionLineCount(section: MarkdownSection): number {
  let count = section.headingLine ? 1 : 0;
  count += section.bodyLines.length;
  for (const child of section.children) {
    count += sectionLineCount(child);
  }
  return count;
}

/** マッチしたセクションの見出し行を比較して DiffLine を追加する */
function compareHeadingLines(
  leftHeading: string, rightHeading: string,
  allLeftLines: DiffLine[], allRightLines: DiffLine[], allBlocks: DiffBlock[],
  blockIdCounter: number,
): number {
  const leftLn = allLeftLines.filter(l => l.lineNumber !== null).length + 1;
  const rightLn = allRightLines.filter(l => l.lineNumber !== null).length + 1;
  if (leftHeading === rightHeading) {
    allLeftLines.push({ text: leftHeading, type: "equal", blockId: null, lineNumber: leftLn });
    allRightLines.push({ text: rightHeading, type: "equal", blockId: null, lineNumber: rightLn });
    return blockIdCounter;
  }
  const blockId = blockIdCounter++;
  allLeftLines.push({ text: leftHeading, type: "modified-old", blockId, lineNumber: leftLn });
  allRightLines.push({ text: rightHeading, type: "modified-new", blockId, lineNumber: rightLn });
  allBlocks.push({
    id: blockId, type: "modified",
    leftStartLine: allLeftLines.length - 1, leftEndLine: allLeftLines.length,
    rightStartLine: allRightLines.length - 1, rightEndLine: allRightLines.length,
    leftLines: [leftHeading], rightLines: [rightHeading],
  });
  return blockIdCounter;
}

/** マッチしたセクション同士を比較する */
function processMatchedSections(
  left: MarkdownSection, right: MarkdownSection,
  allLeftLines: DiffLine[], allRightLines: DiffLine[], allBlocks: DiffBlock[],
  blockIdCounter: number, options?: DiffOptions,
): number {
  if (left.children.length > 0 || right.children.length > 0) {
    if (left.headingLine && right.headingLine) {
      blockIdCounter = compareHeadingLines(left.headingLine, right.headingLine, allLeftLines, allRightLines, allBlocks, blockIdCounter);
    }
    const bodyLeft = left.bodyLines.join("\n");
    const bodyRight = right.bodyLines.join("\n");
    if (bodyLeft || bodyRight) {
      blockIdCounter = appendSubDiff(bodyLeft, bodyRight, allLeftLines, allRightLines, allBlocks, blockIdCounter, options);
    }
    const childMatches = matchSections(left.children, right.children);
    for (const childMatch of childMatches) {
      blockIdCounter = processMatch(childMatch, allLeftLines, allRightLines, allBlocks, blockIdCounter, options);
    }
  } else {
    const leftText = sectionToText(left);
    const rightText = sectionToText(right);
    blockIdCounter = appendSubDiff(leftText, rightText, allLeftLines, allRightLines, allBlocks, blockIdCounter, options);
  }
  return blockIdCounter;
}

/** 片側のみに存在するセクションを removed/added として追加する */
function processOneSideSection(
  section: MarkdownSection, side: "left" | "right",
  allLeftLines: DiffLine[], allRightLines: DiffLine[], allBlocks: DiffBlock[],
  blockIdCounter: number,
): number {
  const lineCount = sectionLineCount(section);
  const blockId = blockIdCounter++;
  const lines: string[] = [];
  collectSectionLines(section, lines);

  if (side === "left") {
    const leftStart = allLeftLines.length;
    let leftLineNum = allLeftLines.filter(l => l.lineNumber !== null).length;
    for (let k = 0; k < lineCount; k++) {
      leftLineNum++;
      allLeftLines.push({ text: lines[k] ?? "", type: "removed", blockId, lineNumber: leftLineNum });
      allRightLines.push({ text: "", type: "padding", blockId, lineNumber: null });
    }
    allBlocks.push({
      id: blockId, type: "removed",
      leftStartLine: leftStart, leftEndLine: leftStart + lineCount,
      rightStartLine: allRightLines.length - lineCount, rightEndLine: allRightLines.length,
      leftLines: lines, rightLines: [],
    });
  } else {
    const rightStart = allRightLines.length;
    let rightLineNum = allRightLines.filter(l => l.lineNumber !== null).length;
    for (let k = 0; k < lineCount; k++) {
      rightLineNum++;
      allLeftLines.push({ text: "", type: "padding", blockId, lineNumber: null });
      allRightLines.push({ text: lines[k] ?? "", type: "added", blockId, lineNumber: rightLineNum });
    }
    allBlocks.push({
      id: blockId, type: "added",
      leftStartLine: allLeftLines.length - lineCount, leftEndLine: allLeftLines.length,
      rightStartLine: rightStart, rightEndLine: rightStart + lineCount,
      leftLines: [], rightLines: lines,
    });
  }
  return blockIdCounter;
}

function processMatch(
  match: { type: string; left: MarkdownSection | null; right: MarkdownSection | null },
  allLeftLines: DiffLine[], allRightLines: DiffLine[], allBlocks: DiffBlock[],
  blockIdCounter: number, options?: DiffOptions,
): number {
  if (match.type === "matched" && match.left && match.right) {
    return processMatchedSections(match.left, match.right, allLeftLines, allRightLines, allBlocks, blockIdCounter, options);
  }
  if (match.type === "left-only" && match.left) {
    return processOneSideSection(match.left, "left", allLeftLines, allRightLines, allBlocks, blockIdCounter);
  }
  if (match.type === "right-only" && match.right) {
    return processOneSideSection(match.right, "right", allLeftLines, allRightLines, allBlocks, blockIdCounter);
  }
  return blockIdCounter;
}

/** サブ diff の結果を allLeftLines/allRightLines に追加し、blockId をリナンバリング */
function appendSubDiff(
  leftText: string, rightText: string,
  allLeftLines: DiffLine[], allRightLines: DiffLine[], allBlocks: DiffBlock[],
  blockIdCounter: number, options?: DiffOptions,
): number {
  if (leftText === "" && rightText === "") return blockIdCounter;
  const sub = computeDiff(leftText || "", rightText || "", options);
  const leftOffset = allLeftLines.length;
  const rightOffset = allRightLines.length;
  // 直前までの実テキスト行数（パディング行を除く）をカウントして行番号オフセットに使用
  const leftLineNumOffset = allLeftLines.filter(l => l.lineNumber !== null).length;
  const rightLineNumOffset = allRightLines.filter(l => l.lineNumber !== null).length;
  for (const line of sub.leftLines) {
    allLeftLines.push({
      ...line,
      blockId: line.blockId !== null ? line.blockId + blockIdCounter : null,
      lineNumber: line.lineNumber !== null ? line.lineNumber + leftLineNumOffset : null,
    });
  }
  for (const line of sub.rightLines) {
    allRightLines.push({
      ...line,
      blockId: line.blockId !== null ? line.blockId + blockIdCounter : null,
      lineNumber: line.lineNumber !== null ? line.lineNumber + rightLineNumOffset : null,
    });
  }
  for (const block of sub.blocks) {
    allBlocks.push({
      ...block,
      id: block.id + blockIdCounter,
      leftStartLine: block.leftStartLine + leftOffset,
      leftEndLine: block.leftEndLine + leftOffset,
      rightStartLine: block.rightStartLine + rightOffset,
      rightEndLine: block.rightEndLine + rightOffset,
    });
  }
  return blockIdCounter + (sub.blocks.length > 0 ? Math.max(...sub.blocks.map(b => b.id)) + 1 : 0);
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
