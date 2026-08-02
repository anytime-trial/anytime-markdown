/**
 * blockDiffComputation.ts のコアアルゴリズム（computeBlockDiff / compareTableCells）を
 * 直接呼ぶユニットテスト。
 *
 * モックノードのビルドパターンは blockCollapsePlan.test.ts の mockNode/mockDoc を踏襲する。
 */
import { computeBlockDiff, compareTableCells } from "../utils/blockDiffComputation";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";

function mockNode(text: string, typeName = "paragraph"): PMNode {
  return {
    textContent: text,
    type: { name: typeName },
    attrs: { level: undefined },
    nodeSize: text.length + 2,
  } as unknown as PMNode;
}

function mockDoc(nodes: PMNode[]): PMNode {
  return {
    forEach: (cb: (node: PMNode, offset: number, index: number) => void) => {
      let offset = 0;
      nodes.forEach((n, i) => {
        cb(n, offset, i);
        offset += n.nodeSize;
      });
    },
    childCount: nodes.length,
  } as unknown as PMNode;
}

const doc = (texts: string[]) => mockDoc(texts.map((t) => mockNode(t)));

function mockCell(text: string): PMNode {
  return { textContent: text } as unknown as PMNode;
}

function mockRow(cells: string[]): PMNode {
  return {
    forEach: (cb: (node: PMNode) => void) => cells.forEach((c) => cb(mockCell(c))),
  } as unknown as PMNode;
}

function mockTable(rows: string[][], text = "table"): PMNode {
  return {
    textContent: text,
    type: { name: "table" },
    attrs: { level: undefined },
    nodeSize: text.length + 2,
    forEach: (cb: (node: PMNode) => void) => rows.forEach((r) => cb(mockRow(r))),
  } as unknown as PMNode;
}

describe("computeBlockDiff", () => {
  test("空ブロック同士は差分無し", () => {
    const { left, right } = computeBlockDiff(doc([]), doc([]));
    expect(left.changedBlocks).toEqual(new Set());
    expect(right.changedBlocks).toEqual(new Set());
    expect(left.cellDiffs.size).toBe(0);
    expect(right.cellDiffs.size).toBe(0);
    expect(left.placeholderPositions).toEqual([]);
    expect(right.placeholderPositions).toEqual([]);
  });

  test("片側が空で他方にのみブロックがある場合は全ブロックが変更扱い", () => {
    const { left, right } = computeBlockDiff(doc([]), doc(["A", "B"]));
    expect(left.changedBlocks).toEqual(new Set());
    expect(right.changedBlocks).toEqual(new Set([0, 1]));
  });

  test("順序入れ替え → LCS でマッチしたブロックは変更扱いにならない", () => {
    // 左=[A,B] 右=[B,A]。B は位置を変えても内容が同一のため LCS マッチし不変扱いになる。
    const { left, right } = computeBlockDiff(doc(["A", "B"]), doc(["B", "A"]));
    // マッチしなかった A のみが両側で変更扱いになる。B（マッチ側）は含まれない。
    expect(left.changedBlocks.has(1)).toBe(false);
    expect(right.changedBlocks.has(0)).toBe(false);
    expect(left.changedBlocks.size).toBe(1);
    expect(right.changedBlocks.size).toBe(1);
  });

  test("部分一致 → 変更ブロックのみ両側で変更扱い、一致ブロックは変更扱いにならない", () => {
    // 左=[A,B,C] 右=[A,X,C]。A/C は一致、B↔X が置換される。
    const { left, right } = computeBlockDiff(doc(["A", "B", "C"]), doc(["A", "X", "C"]));
    expect(left.changedBlocks).toEqual(new Set([1]));
    expect(right.changedBlocks).toEqual(new Set([1]));
  });

  test("table ブロックが不一致の場合はブロック丸ごとでなくセル単位の差分になる", () => {
    const leftDoc = mockDoc([mockTable([["a", "b"], ["c", "d"]], "left-table")]);
    const rightDoc = mockDoc([mockTable([["a", "x"], ["c", "d"]], "right-table")]);
    const { left, right } = computeBlockDiff(leftDoc, rightDoc);
    // ブロック全体は「変更」に追加されない（セル単位に切り出されるため）
    expect(left.changedBlocks.size).toBe(0);
    expect(right.changedBlocks.size).toBe(0);
    expect(left.cellDiffs.get(0)).toEqual(new Set([1]));
    expect(right.cellDiffs.get(0)).toEqual(new Set([1]));
  });
});

describe("compareTableCells", () => {
  test("完全一致テーブルは差分セル無し", () => {
    const left = mockTable([["a", "b"], ["c", "d"]]);
    const right = mockTable([["a", "b"], ["c", "d"]]);
    const { leftCells, rightCells } = compareTableCells(left, right);
    expect(leftCells).toEqual(new Set());
    expect(rightCells).toEqual(new Set());
  });

  test("1セルのみ内容が異なる場合は同一 flat index が両側に記録される", () => {
    const left = mockTable([["a", "b"], ["c", "d"]]);
    const right = mockTable([["a", "X"], ["c", "d"]]);
    const { leftCells, rightCells } = compareTableCells(left, right);
    expect(leftCells).toEqual(new Set([1]));
    expect(rightCells).toEqual(new Set([1]));
  });

  test("行数不一致 → 余剰行の全セルが片側のみ変更扱い", () => {
    const left = mockTable([["a", "b"], ["c", "d"]]);
    const right = mockTable([["a", "b"]]);
    const { leftCells, rightCells } = compareTableCells(left, right);
    expect(leftCells).toEqual(new Set([2, 3]));
    expect(rightCells).toEqual(new Set());
  });

  test("列数不一致（行は対応） → 余剰列のみ片側で変更扱い", () => {
    const left = mockTable([["a", "b", "c"]]);
    const right = mockTable([["a", "b"]]);
    const { leftCells, rightCells } = compareTableCells(left, right);
    expect(leftCells).toEqual(new Set([2]));
    expect(rightCells).toEqual(new Set());
  });

  test("右側にのみ行がある場合は右側の全セルが変更扱い", () => {
    const left = mockTable([["a", "b"]]);
    const right = mockTable([["a", "b"], ["c", "d"]]);
    const { leftCells, rightCells } = compareTableCells(left, right);
    expect(leftCells).toEqual(new Set());
    expect(rightCells).toEqual(new Set([2, 3]));
  });
});
