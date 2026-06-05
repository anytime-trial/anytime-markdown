import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";

import { markContextVisible, MIN_COLLAPSE_RUN } from "./diffEngine";

// --- Block diff computation ---

interface BlockInfo {
  text: string;
  typeName: string;
  level?: number;
}

/** 折りたたみ run（左右で共有する runId 付き） */
export interface CollapseRun {
  /** 左右共有 ID（アライン slot 開始 index） */
  runId: number;
  /** この side で非表示にするトップレベルブロック index 群 */
  hideIndices: number[];
  /** 展開ウィジェットを置くブロック index（hideIndices の先頭） */
  anchorIndex: number;
  /** 畳む slot 数（左右で同一） */
  count: number;
}

export interface BlockCollapsePlan {
  /** docA（第1引数）用の run 一覧 */
  aRuns: CollapseRun[];
  /** docB（第2引数）用の run 一覧 */
  bRuns: CollapseRun[];
}

export function getTopLevelBlocks(doc: PMNode): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  doc.forEach((node) => {
    blocks.push({ text: node.textContent, typeName: node.type.name, level: node.attrs.level as number | undefined });
  });
  return blocks;
}

/** テーブルノードから行×列のテキスト配列を取得 */
function getTableRows(table: PMNode): string[][] {
  const rows: string[][] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      cells.push(cell.textContent);
    });
    rows.push(cells);
  });
  return rows;
}

/** 片側のみに存在する行の全セルを変更セットに追加 */
function markAllCells(row: string[], flatIdx: number, changed: Set<number>): void {
  for (let c = 0; c < row.length; c++) changed.add(flatIdx + c);
}

/** 両側に存在する行を列単位で比較 */
function compareRowCells(
  lRow: string[], rRow: string[],
  leftFlatIdx: number, rightFlatIdx: number,
  leftChanged: Set<number>, rightChanged: Set<number>,
): void {
  const maxCol = Math.max(lRow.length, rRow.length);
  for (let c = 0; c < maxCol; c++) {
    if (c >= lRow.length) rightChanged.add(rightFlatIdx + c);
    else if (c >= rRow.length) leftChanged.add(leftFlatIdx + c);
    else if (lRow[c] !== rRow[c]) {
      leftChanged.add(leftFlatIdx + c);
      rightChanged.add(rightFlatIdx + c);
    }
  }
}

/** セル単位でテーブルを比較する */
export function compareTableCells(
  leftTable: PMNode,
  rightTable: PMNode,
): { leftCells: Set<number>; rightCells: Set<number> } {
  const leftRows = getTableRows(leftTable);
  const rightRows = getTableRows(rightTable);
  const leftChanged = new Set<number>();
  const rightChanged = new Set<number>();

  const maxRowLen = Math.max(leftRows.length, rightRows.length);
  let leftFlatIdx = 0;
  let rightFlatIdx = 0;

  for (let r = 0; r < maxRowLen; r++) {
    const lRow = leftRows[r];
    const rRow = rightRows[r];

    if (!lRow) {
      if (rRow) { markAllCells(rRow, rightFlatIdx, rightChanged); rightFlatIdx += rRow.length; }
      continue;
    }
    if (!rRow) {
      markAllCells(lRow, leftFlatIdx, leftChanged);
      leftFlatIdx += lRow.length;
      continue;
    }

    compareRowCells(lRow, rRow, leftFlatIdx, rightFlatIdx, leftChanged, rightChanged);
    leftFlatIdx += lRow.length;
    rightFlatIdx += rRow.length;
  }

  return { leftCells: leftChanged, rightCells: rightChanged };
}

export interface PlaceholderPosition {
  pos: number;       // ProseMirror ドキュメント内の挿入位置
  lineCount: number; // プレースホルダーの行数（高さの目安）
}

export interface BlockDiffResult {
  /** ブロック全体をハイライトするインデックス */
  changedBlocks: Set<number>;
  /** テーブルのセル単位ハイライト: blockIndex → 変更セルの flat index set */
  cellDiffs: Map<number, Set<number>>;
  /** セマンティック比較で反対側にのみ存在するセクションのプレースホルダー位置 */
  placeholderPositions: PlaceholderPosition[];
}

/**
 * LCS ベースのブロックレベル差分を計算する。
 * テーブルブロックはセル単位で比較する。
 */
export function computeBlockDiff(
  leftDoc: PMNode,
  rightDoc: PMNode,
  options?: { semantic?: boolean },
): { left: BlockDiffResult; right: BlockDiffResult } {
  if (options?.semantic) {
    return computeSemanticBlockDiff(leftDoc, rightDoc);
  }
  return computeFlatBlockDiff(leftDoc, rightDoc);
}

/** heading ノードを検出し、セクション範囲（ブロックインデックス）を返す */
interface BlockSection {
  headingText: string;
  headingIndex: number; // トップレベルブロックの index
  startIndex: number;   // セクション開始（見出し含む）
  endIndex: number;     // セクション終了（排他）
}

/** 最初の heading レベルを検出する */
function findSplitLevel(blocks: BlockInfo[]): number {
  for (const block of blocks) {
    if (block.typeName === "heading") {
      return block.level ?? 1;
    }
  }
  return 0;
}

/** 最初の heading より前のブロックインデックスを収集する */
function collectPreSections(blocks: BlockInfo[], splitLevel: number): { preSections: number[]; startIdx: number } {
  const preSections: number[] = [];
  let i = 0;
  while (i < blocks.length) {
    if (blocks[i].typeName === "heading" && (blocks[i].level ?? 1) === splitLevel) break;
    preSections.push(i);
    i++;
  }
  return { preSections, startIdx: i };
}

/** heading ごとにセクションを分割する */
function splitIntoSections(blocks: BlockInfo[], splitLevel: number, startIdx: number): BlockSection[] {
  const sections: BlockSection[] = [];
  let i = startIdx;
  while (i < blocks.length) {
    if (blocks[i].typeName !== "heading" || (blocks[i].level ?? 1) !== splitLevel) { i++; continue; }
    const headingIndex = i;
    const headingText = blocks[i].text;
    i++;
    while (i < blocks.length) {
      if (blocks[i].typeName === "heading" && (blocks[i].level ?? 1) <= splitLevel) break;
      i++;
    }
    sections.push({ headingText, headingIndex, startIndex: headingIndex, endIndex: i });
  }
  return sections;
}

function getBlockSections(blocks: BlockInfo[]): { preSections: number[]; sections: BlockSection[] } {
  const splitLevel = findSplitLevel(blocks);
  if (splitLevel === 0) {
    return { preSections: blocks.map((_, i) => i), sections: [] };
  }
  const { preSections, startIdx } = collectPreSections(blocks, splitLevel);
  const sections = splitIntoSections(blocks, splitLevel, startIdx);
  return { preSections, sections };
}

/** 2つの文字列配列の LCS ペア（インデックス組）を計算する */
function computeLcsPairs(leftTexts: string[], rightTexts: string[]): [number, number][] {
  const n = leftTexts.length;
  const m = rightTexts.length;
  // 連続メモリの Int32Array(フルテーブル) で確保し GC 断片化を抑える。dp[i*W+j] でアクセス。
  const W = m + 1;
  const dp = new Int32Array((n + 1) * W);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i * W + j] = leftTexts[i - 1] === rightTexts[j - 1]
        ? dp[(i - 1) * W + (j - 1)] + 1
        : Math.max(dp[(i - 1) * W + j], dp[i * W + (j - 1)]);
    }
  }
  const pairs: [number, number][] = [];
  let li = n, ri = m;
  while (li > 0 && ri > 0) {
    if (leftTexts[li - 1] === rightTexts[ri - 1]) { pairs.push([li - 1, ri - 1]); li--; ri--; }
    else if (dp[(li - 1) * W + ri] >= dp[li * W + (ri - 1)]) { li--; }
    else { ri--; }
  }
  pairs.reverse();
  return pairs;
}

/**
 * 指定範囲 [from, to) のアイテムをそのまま収集する。
 * classifyByPairs では LCS の単調性により範囲内に matched インデックスが含まれないため、
 * 旧実装の Set.has() チェック（常に false）と Set 構築は不要。
 */
function collectRange<T>(items: T[], from: number, to: number, out: T[]): void {
  for (let i = from; i < to; i++) out.push(items[i]);
}

/** LCS ペアからマッチ/左のみ/右のみに分類する */
function classifyByPairs<T>(
  leftItems: T[], rightItems: T[], pairs: [number, number][],
): { matched: [T, T][]; leftOnly: T[]; rightOnly: T[] } {
  const matched: [T, T][] = [];
  const leftOnly: T[] = [];
  const rightOnly: T[] = [];

  let lp = 0, rp = 0;
  for (const [lIdx, rIdx] of pairs) {
    collectRange(leftItems, lp, lIdx, leftOnly);
    collectRange(rightItems, rp, rIdx, rightOnly);
    matched.push([leftItems[lIdx], rightItems[rIdx]]);
    lp = lIdx + 1;
    rp = rIdx + 1;
  }
  collectRange(leftItems, lp, leftItems.length, leftOnly);
  collectRange(rightItems, rp, rightItems.length, rightOnly);

  return { matched, leftOnly, rightOnly };
}

/** セクション LCS マッチング（heading テキストベース） */
function matchBlockSections(
  leftSections: BlockSection[], rightSections: BlockSection[],
): { matched: [BlockSection, BlockSection][]; leftOnly: BlockSection[]; rightOnly: BlockSection[] } {
  const leftTexts = leftSections.map(s => s.headingText);
  const rightTexts = rightSections.map(s => s.headingText);
  const pairs = computeLcsPairs(leftTexts, rightTexts);
  return classifyByPairs(leftSections, rightSections, pairs);
}

/** 片側のみのセクションを changed に追加し、反対側にプレースホルダーを挿入する */
function markUnmatchedSections(
  sections: BlockSection[],
  ownResult: BlockDiffResult,
  otherResult: BlockDiffResult,
  otherNodes: PMNode[],
  matched: [BlockSection, BlockSection][],
  side: "left" | "right",
): void {
  for (const sec of sections) {
    for (let k = sec.startIndex; k < sec.endIndex; k++) {
      ownResult.changedBlocks.add(k);
    }
    const afterPos = findInsertPosition(otherNodes, sec, matched, side);
    otherResult.placeholderPositions.push({ pos: afterPos, lineCount: sec.endIndex - sec.startIndex });
  }
}

/** セクション対応率がこれ未満なら semantic を諦め flat 差分にフォールバックする閾値 */
const SEMANTIC_MATCH_MIN_COVERAGE = 0.4;

/** セマンティック（見出しベース）ブロック差分 */
function computeSemanticBlockDiff(
  leftDoc: PMNode, rightDoc: PMNode,
): { left: BlockDiffResult; right: BlockDiffResult } {
  const leftBlocks = getTopLevelBlocks(leftDoc);
  const rightBlocks = getTopLevelBlocks(rightDoc);
  const leftSec = getBlockSections(leftBlocks);
  const rightSec = getBlockSections(rightBlocks);

  const leftResult: BlockDiffResult = { changedBlocks: new Set(), cellDiffs: new Map(), placeholderPositions: [] };
  const rightResult: BlockDiffResult = { changedBlocks: new Set(), cellDiffs: new Map(), placeholderPositions: [] };

  // heading がない場合はフォールバック
  if (leftSec.sections.length === 0 && rightSec.sections.length === 0) {
    return computeFlatBlockDiff(leftDoc, rightDoc);
  }

  const leftNodes: PMNode[] = [];
  leftDoc.forEach((node) => leftNodes.push(node));
  const rightNodes: PMNode[] = [];
  rightDoc.forEach((node) => rightNodes.push(node));

  // pre-section の比較（フラットブロック diff）
  diffBlockRange({ leftBlocks, rightBlocks, leftNodes, rightNodes,
    leftIndices: leftSec.preSections, rightIndices: rightSec.preSections, leftResult, rightResult });

  // セクション LCS マッチング
  const { matched, leftOnly, rightOnly } = matchBlockSections(leftSec.sections, rightSec.sections);

  // マッチ品質が低い（見出しがほとんど対応しない）場合は flat にフォールバックする。
  // semantic を貫くと未マッチセクションの巨大プレースホルダで上部が空白だらけになるため。
  const sectionBlocks = (secs: BlockSection[]) => secs.reduce((sum, s) => sum + (s.endIndex - s.startIndex), 0);
  const totalSectionBlocks = sectionBlocks(leftSec.sections) + sectionBlocks(rightSec.sections);
  const matchedSectionBlocks = matched.reduce((sum, [ls, rs]) => sum + (ls.endIndex - ls.startIndex) + (rs.endIndex - rs.startIndex), 0);
  if (totalSectionBlocks > 0 && matchedSectionBlocks / totalSectionBlocks < SEMANTIC_MATCH_MIN_COVERAGE) {
    return computeFlatBlockDiff(leftDoc, rightDoc);
  }

  // マッチしたセクション: セクション内ブロックを diff
  for (const [ls, rs] of matched) {
    const leftRange = Array.from({ length: ls.endIndex - ls.startIndex }, (_, i) => ls.startIndex + i);
    const rightRange = Array.from({ length: rs.endIndex - rs.startIndex }, (_, i) => rs.startIndex + i);
    diffBlockRange({ leftBlocks, rightBlocks, leftNodes, rightNodes, leftIndices: leftRange, rightIndices: rightRange, leftResult, rightResult });
  }

  // 片側のみのセクションを処理
  markUnmatchedSections(leftOnly, leftResult, rightResult, rightNodes, matched, "right");
  markUnmatchedSections(rightOnly, rightResult, leftResult, leftNodes, matched, "left");

  return { left: leftResult, right: rightResult };
}

/** マッチしなかったセクションのプレースホルダー挿入位置を計算 */
function findInsertPosition(
  targetNodes: PMNode[],
  unmatched: BlockSection,
  matched: [BlockSection, BlockSection][],
  side: "left" | "right",
): number {
  // unmatched セクションの直前にあるマッチセクションの終端位置を探す
  let bestEndIndex = 0;
  for (const [ls, rs] of matched) {
    const ref = side === "left" ? rs : ls; // unmatched の反対側でマッチしたセクション
    const target = side === "left" ? ls : rs; // プレースホルダーを入れる側のセクション
    if (ref.startIndex < unmatched.startIndex) {
      bestEndIndex = Math.max(bestEndIndex, target.endIndex);
    }
  }
  // ProseMirror の pos を計算
  let pos = 0;
  for (let i = 0; i < bestEndIndex && i < targetNodes.length; i++) {
    pos += targetNodes[i].nodeSize;
  }
  return pos;
}

/** ブロック情報の LCS を計算し、マッチペアを返す */
function computeBlockLcsPairs(lb: BlockInfo[], rb: BlockInfo[]): [number, number][] {
  const n = lb.length;
  const m = rb.length;
  // 連続メモリの Int32Array(フルテーブル) で確保し GC 断片化を抑える。dp[i*W+j] でアクセス。
  const W = m + 1;
  const dp = new Int32Array((n + 1) * W);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (lb[i - 1].text === rb[j - 1].text && lb[i - 1].typeName === rb[j - 1].typeName) {
        dp[i * W + j] = dp[(i - 1) * W + (j - 1)] + 1;
      } else {
        dp[i * W + j] = Math.max(dp[(i - 1) * W + j], dp[i * W + (j - 1)]);
      }
    }
  }
  const pairs: [number, number][] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (lb[i - 1].text === rb[j - 1].text && lb[i - 1].typeName === rb[j - 1].typeName) {
      pairs.unshift([i - 1, j - 1]); i--; j--;
    } else if (dp[(i - 1) * W + j] > dp[i * W + (j - 1)]) { i--; } else { j--; }
  }
  return pairs;
}

interface ApplyUnmatchedPairsParams {
  unmL: number[];
  unmR: number[];
  leftBlocks: BlockInfo[];
  rightBlocks: BlockInfo[];
  leftNodes: PMNode[];
  rightNodes: PMNode[];
  leftIndices: number[];
  rightIndices: number[];
  leftResult: BlockDiffResult;
  rightResult: BlockDiffResult;
}

/** アンマッチブロックのペアを差分結果に適用する */
function applyUnmatchedPairs({
  unmL, unmR,
  leftBlocks, rightBlocks,
  leftNodes, rightNodes,
  leftIndices, rightIndices,
  leftResult, rightResult,
}: ApplyUnmatchedPairsParams): void {
  const pairLen = Math.min(unmL.length, unmR.length);
  for (let k = 0; k < pairLen; k++) {
    const li = leftIndices[unmL[k]];
    const ri = rightIndices[unmR[k]];
    if (leftBlocks[li].typeName === "table" && rightBlocks[ri].typeName === "table") {
      const { leftCells, rightCells } = compareTableCells(leftNodes[li], rightNodes[ri]);
      if (leftCells.size > 0) leftResult.cellDiffs.set(li, leftCells);
      if (rightCells.size > 0) rightResult.cellDiffs.set(ri, rightCells);
    } else {
      leftResult.changedBlocks.add(li);
      rightResult.changedBlocks.add(ri);
    }
  }
  for (let k = pairLen; k < unmL.length; k++) leftResult.changedBlocks.add(leftIndices[unmL[k]]);
  for (let k = pairLen; k < unmR.length; k++) rightResult.changedBlocks.add(rightIndices[unmR[k]]);
}

interface DiffBlockRangeParams {
  leftBlocks: BlockInfo[];
  rightBlocks: BlockInfo[];
  leftNodes: PMNode[];
  rightNodes: PMNode[];
  leftIndices: number[];
  rightIndices: number[];
  leftResult: BlockDiffResult;
  rightResult: BlockDiffResult;
}

/** ブロック範囲内のフラット diff（既存ロジック） */
function diffBlockRange({
  leftBlocks, rightBlocks,
  leftNodes, rightNodes,
  leftIndices, rightIndices,
  leftResult, rightResult,
}: DiffBlockRangeParams): void {
  const lb = leftIndices.map(i => leftBlocks[i]);
  const rb = rightIndices.map(i => rightBlocks[i]);
  const n = lb.length;
  const m = rb.length;

  const pairs = computeBlockLcsPairs(lb, rb);

  let prevL = -1, prevR = -1;
  for (const [ml, mr] of [...pairs, [n, m] as [number, number]]) {
    const unmL: number[] = [];
    for (let k = prevL + 1; k < ml; k++) unmL.push(k);
    const unmR: number[] = [];
    for (let k = prevR + 1; k < mr; k++) unmR.push(k);

    applyUnmatchedPairs({ unmL, unmR, leftBlocks, rightBlocks, leftNodes, rightNodes, leftIndices, rightIndices, leftResult, rightResult });

    prevL = ml; prevR = mr;
  }
}

function computeFlatBlockDiff(
  leftDoc: PMNode, rightDoc: PMNode,
): { left: BlockDiffResult; right: BlockDiffResult } {
  const leftBlocks = getTopLevelBlocks(leftDoc);
  const rightBlocks = getTopLevelBlocks(rightDoc);
  const leftNodes: PMNode[] = [];
  leftDoc.forEach((node) => leftNodes.push(node));
  const rightNodes: PMNode[] = [];
  rightDoc.forEach((node) => rightNodes.push(node));

  const leftResult: BlockDiffResult = { changedBlocks: new Set(), cellDiffs: new Map(), placeholderPositions: [] };
  const rightResult: BlockDiffResult = { changedBlocks: new Set(), cellDiffs: new Map(), placeholderPositions: [] };

  const allLeft = leftBlocks.map((_, i) => i);
  const allRight = rightBlocks.map((_, i) => i);
  diffBlockRange({ leftBlocks, rightBlocks, leftNodes, rightNodes, leftIndices: allLeft, rightIndices: allRight, leftResult, rightResult });

  return { left: leftResult, right: rightResult };
}


/**
 * 左右ドキュメントのトップレベルブロックを LCS で整合し、未変更ブロックの折りたたみ計画を返す。
 * WYSIWYG 比較の「変更箇所のみ表示」で左右を厳密に同じ単位で畳む/展開するために使う。
 * - aRuns[k] と bRuns[k] は同一 runId を共有し、同じ論理範囲を指す。
 * - 折りたたみ run は未変更（LCS マッチ）slot のみで構成されるため、各 run は左右両方の index を持つ。
 */
export function computeBlockCollapsePlan(docA: PMNode, docB: PMNode, context: number): BlockCollapsePlan {
  const aBlocks = getTopLevelBlocks(docA);
  const bBlocks = getTopLevelBlocks(docB);
  const pairs = computeBlockLcsPairs(aBlocks, bBlocks);

  // 左右を整合した slot 列を組み立てる（equal=LCS マッチ、それ以外は片側のみ=変更）
  interface Slot { a: number | null; b: number | null; equal: boolean }
  const slots: Slot[] = [];
  let pa = 0;
  let pb = 0;
  for (const [ai, bi] of pairs) {
    while (pa < ai) { slots.push({ a: pa, b: null, equal: false }); pa++; }
    while (pb < bi) { slots.push({ a: null, b: pb, equal: false }); pb++; }
    slots.push({ a: ai, b: bi, equal: true });
    pa = ai + 1;
    pb = bi + 1;
  }
  while (pa < aBlocks.length) { slots.push({ a: pa, b: null, equal: false }); pa++; }
  while (pb < bBlocks.length) { slots.push({ a: null, b: pb, equal: false }); pb++; }

  const visible = markContextVisible(slots.length, (i) => !slots[i].equal, context);

  const aRuns: CollapseRun[] = [];
  const bRuns: CollapseRun[] = [];
  let i = 0;
  while (i < slots.length) {
    if (visible[i]) { i++; continue; }
    let j = i;
    while (j < slots.length && !visible[j]) j++;
    const len = j - i;
    if (len >= MIN_COLLAPSE_RUN) {
      const runId = i;
      const aIdx: number[] = [];
      const bIdx: number[] = [];
      for (let k = i; k < j; k++) {
        if (slots[k].a !== null) aIdx.push(slots[k].a as number);
        if (slots[k].b !== null) bIdx.push(slots[k].b as number);
      }
      if (aIdx.length > 0) aRuns.push({ runId, hideIndices: aIdx, anchorIndex: aIdx[0], count: len });
      if (bIdx.length > 0) bRuns.push({ runId, hideIndices: bIdx, anchorIndex: bIdx[0], count: len });
    }
    i = j;
  }
  return { aRuns, bRuns };
}
