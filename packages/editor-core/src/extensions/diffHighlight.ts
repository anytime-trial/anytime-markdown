import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const diffHighlightPluginKey = new PluginKey("diffHighlight");

// --- Block diff computation ---

interface BlockInfo {
  text: string;
  typeName: string;
  level?: number;
}

function getTopLevelBlocks(doc: PMNode): BlockInfo[] {
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
function compareTableCells(
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
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = leftTexts[i - 1] === rightTexts[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const pairs: [number, number][] = [];
  let li = n, ri = m;
  while (li > 0 && ri > 0) {
    if (leftTexts[li - 1] === rightTexts[ri - 1]) { pairs.push([li - 1, ri - 1]); li--; ri--; }
    else if (dp[li - 1][ri] >= dp[li][ri - 1]) { li--; }
    else { ri--; }
  }
  pairs.reverse();
  return pairs;
}

/** 指定 Set に含まれないアイテムを収集する */
function collectUnmatched<T>(items: T[], from: number, to: number, matchedSet: Set<number>, out: T[]): void {
  for (let i = from; i < to; i++) {
    if (!matchedSet.has(i)) out.push(items[i]);
  }
}

/** LCS ペアからマッチ/左のみ/右のみに分類する */
function classifyByPairs<T>(
  leftItems: T[], rightItems: T[], pairs: [number, number][],
): { matched: [T, T][]; leftOnly: T[]; rightOnly: T[] } {
  const matched: [T, T][] = [];
  const leftOnly: T[] = [];
  const rightOnly: T[] = [];
  const matchedLeftSet = new Set(pairs.map(p => p[0]));
  const matchedRightSet = new Set(pairs.map(p => p[1]));

  let lp = 0, rp = 0;
  for (const [lIdx, rIdx] of pairs) {
    collectUnmatched(leftItems, lp, lIdx, matchedLeftSet, leftOnly);
    collectUnmatched(rightItems, rp, rIdx, matchedRightSet, rightOnly);
    matched.push([leftItems[lIdx], rightItems[rIdx]]);
    lp = lIdx + 1;
    rp = rIdx + 1;
  }
  collectUnmatched(leftItems, lp, leftItems.length, matchedLeftSet, leftOnly);
  collectUnmatched(rightItems, rp, rightItems.length, matchedRightSet, rightOnly);

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
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (lb[i - 1].text === rb[j - 1].text && lb[i - 1].typeName === rb[j - 1].typeName) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const pairs: [number, number][] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (lb[i - 1].text === rb[j - 1].text && lb[i - 1].typeName === rb[j - 1].typeName) {
      pairs.unshift([i - 1, j - 1]); i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) { i--; } else { j--; }
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

// --- Tiptap Extension ---

interface DiffHighlightState {
  changedBlocks: Set<number>;
  cellDiffs: Map<number, Set<number>>;
  placeholderPositions: PlaceholderPosition[];
  side: "left" | "right";
}

const EMPTY_STATE: DiffHighlightState = {
  changedBlocks: new Set(),
  cellDiffs: new Map(),
  placeholderPositions: [],
  side: "left",
};

const LEFT_BLOCK_STYLE = "background-color: rgba(248, 81, 73, 0.10); border-radius: 4px;";
const RIGHT_BLOCK_STYLE = "background-color: rgba(46, 160, 67, 0.10); border-radius: 4px;";
const LEFT_CELL_STYLE = "background-color: rgba(248, 81, 73, 0.18);";
const RIGHT_CELL_STYLE = "background-color: rgba(46, 160, 67, 0.18);";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    diffHighlight: {
      setDiffHighlight: (
        result: BlockDiffResult,
        side: "left" | "right",
      ) => ReturnType;
      clearDiffHighlight: () => ReturnType;
    };
  }
}

/** ブロック変更のデコレーションを作成する */
function buildBlockDecorations(
  node: PMNode, pos: number, blockIndex: number,
  changedBlocks: Set<number>, blockStyle: string,
  decorations: Decoration[],
): void {
  if (changedBlocks.has(blockIndex)) {
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, { style: blockStyle }),
    );
  }
}

/** セル差分のデコレーションを作成する */
function buildCellDecorations(
  node: PMNode, pos: number, blockIndex: number,
  cellDiffs: Map<number, Set<number>>, cellStyle: string,
  decorations: Decoration[],
): void {
  if (!cellDiffs.has(blockIndex)) return;
  const changedCellSet = cellDiffs.get(blockIndex);
  if (!changedCellSet) return;
  let flatCellIndex = 0;
  node.forEach((row, rowOffset) => {
    row.forEach((cell, cellOffset) => {
      if (changedCellSet.has(flatCellIndex)) {
        const cellPos = pos + 1 + rowOffset + 1 + cellOffset;
        decorations.push(
          Decoration.node(cellPos, cellPos + cell.nodeSize, {
            style: cellStyle,
          }),
        );
      }
      flatCellIndex++;
    });
  });
}

/** プレースホルダー Widget デコレーションを作成する */
function buildPlaceholderDecorations(
  placeholderPositions: PlaceholderPosition[],
  decorations: Decoration[],
): void {
  const lineHeight = 1.6;
  const fontSize = 16;
  for (const ph of placeholderPositions) {
    const height = ph.lineCount * fontSize * lineHeight;
    decorations.push(
      Decoration.widget(ph.pos, () => {
        const el = document.createElement("div");
        el.style.height = `${height}px`;
        el.style.backgroundColor = "rgba(128, 128, 128, 0.06)";
        el.style.borderRadius = "4px";
        el.style.margin = "2px 0";
        el.setAttribute("aria-hidden", "true");
        return el;
      }, { side: 1 }),
    );
  }
}

export const DiffHighlight = Extension.create({
  name: "diffHighlight",

  addCommands() {
    return {
      setDiffHighlight:
        (result: BlockDiffResult, side: "left" | "right") =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(diffHighlightPluginKey, {
              changedBlocks: result.changedBlocks,
              cellDiffs: result.cellDiffs,
              placeholderPositions: result.placeholderPositions ?? [],
              side,
            } satisfies DiffHighlightState);
          }
          return true;
        },
      clearDiffHighlight:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(diffHighlightPluginKey, EMPTY_STATE);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: diffHighlightPluginKey,
        state: {
          init(): DiffHighlightState {
            return EMPTY_STATE;
          },
          apply(tr, value: DiffHighlightState): DiffHighlightState {
            const meta = tr.getMeta(diffHighlightPluginKey) as DiffHighlightState | undefined;
            if (meta) return meta;
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = diffHighlightPluginKey.getState(state) as
              | DiffHighlightState
              | undefined;
            if (!pluginState) return DecorationSet.empty;
            const { changedBlocks, cellDiffs, placeholderPositions, side } = pluginState;
            if (changedBlocks.size === 0 && cellDiffs.size === 0 && placeholderPositions.length === 0) {
              return DecorationSet.empty;
            }

            const blockStyle = side === "left" ? LEFT_BLOCK_STYLE : RIGHT_BLOCK_STYLE;
            const cellStyle = side === "left" ? LEFT_CELL_STYLE : RIGHT_CELL_STYLE;
            const decorations: Decoration[] = [];
            let blockIndex = 0;

            state.doc.forEach((node, pos) => {
              buildBlockDecorations(node, pos, blockIndex, changedBlocks, blockStyle, decorations);
              buildCellDecorations(node, pos, blockIndex, cellDiffs, cellStyle, decorations);
              blockIndex++;
            });

            buildPlaceholderDecorations(placeholderPositions, decorations);

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
