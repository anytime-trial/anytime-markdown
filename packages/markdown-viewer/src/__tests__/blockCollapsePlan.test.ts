import { computeBlockAlignment,computeBlockCollapsePlan } from "../utils/blockDiffComputation";
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

describe("computeBlockAlignment", () => {
  test("同一文書 → 全 slot が equal で左右 index 対応", () => {
    const slots = computeBlockAlignment(doc(["A", "B"]), doc(["A", "B"]));
    expect(slots).toEqual([
      { a: 0, b: 0, equal: true },
      { a: 1, b: 1, equal: true },
    ]);
  });

  test("右に挿入 → 挿入ブロックは b のみの非 equal slot", () => {
    const slots = computeBlockAlignment(doc(["A", "C"]), doc(["A", "B", "C"]));
    expect(slots).toEqual([
      { a: 0, b: 0, equal: true },
      { a: null, b: 1, equal: false },
      { a: 1, b: 2, equal: true },
    ]);
  });

  test("置換 → 双方の非 equal slot を挟む", () => {
    const slots = computeBlockAlignment(doc(["A", "X", "B"]), doc(["A", "Y", "B"]));
    expect(slots).toEqual([
      { a: 0, b: 0, equal: true },
      { a: 1, b: null, equal: false },
      { a: null, b: 1, equal: false },
      { a: 2, b: 2, equal: true },
    ]);
  });
});

describe("computeBlockCollapsePlan", () => {
  test("同一文書 → 全体が1つの run、左右で同じ件数・index", () => {
    const d = doc(["A", "B", "C", "D"]);
    const { aRuns, bRuns } = computeBlockCollapsePlan(doc(["A", "B", "C", "D"]), d, 0);
    expect(aRuns).toHaveLength(1);
    expect(bRuns).toHaveLength(1);
    expect(aRuns[0].hideIndices).toEqual([0, 1, 2, 3]);
    expect(bRuns[0].hideIndices).toEqual([0, 1, 2, 3]);
    expect(aRuns[0].count).toBe(4);
    expect(bRuns[0].count).toBe(4);
    expect(aRuns[0].runId).toBe(bRuns[0].runId);
  });

  test("中央の変更で run が前後に分割される（context=0）", () => {
    const a = doc(["A", "B", "Cx", "D", "E"]);
    const b = doc(["A", "B", "Cy", "D", "E"]);
    const { aRuns, bRuns } = computeBlockCollapsePlan(a, b, 0);
    // [A,B] と [D,E] の 2 run、左右対応
    expect(aRuns.map((r) => r.hideIndices)).toEqual([[0, 1], [3, 4]]);
    expect(bRuns.map((r) => r.hideIndices)).toEqual([[0, 1], [3, 4]]);
    expect(aRuns.map((r) => r.runId)).toEqual(bRuns.map((r) => r.runId));
    expect(aRuns.map((r) => r.count)).toEqual(bRuns.map((r) => r.count));
  });

  test("片側挿入でも左右の run 件数と count が一致する", () => {
    // 右に X を挿入。LCS: A,B,C が一致
    const a = doc(["A", "B", "C"]);
    const b = doc(["A", "X", "B", "C"]);
    const { aRuns, bRuns } = computeBlockCollapsePlan(a, b, 0);
    expect(aRuns).toHaveLength(bRuns.length);
    for (let i = 0; i < aRuns.length; i++) {
      expect(aRuns[i].runId).toBe(bRuns[i].runId);
      expect(aRuns[i].count).toBe(bRuns[i].count);
    }
    // B,C は畳まれる（A は単独 len1<2 で残る）
    expect(aRuns).toHaveLength(1);
    expect(aRuns[0].hideIndices).toEqual([1, 2]); // a の B,C
    expect(bRuns[0].hideIndices).toEqual([2, 3]); // b の B,C（X 挿入で +1）
  });

  test("context=1 で変更の前後 1 ブロックは可視（畳まれない）", () => {
    const a = doc(["A", "B", "Cx", "D", "E"]);
    const b = doc(["A", "B", "Cy", "D", "E"]);
    const { aRuns } = computeBlockCollapsePlan(a, b, 1);
    // 変更 slot の前後1が可視 → 畳めるのは端の単独ブロックのみ（len1<2）で run 無し
    expect(aRuns).toHaveLength(0);
  });

  test("MIN_COLLAPSE_RUN 未満（1ブロック）の未変更ランは畳まない", () => {
    // A B [change] C [change] ... C は長さ1の未変更ランになるよう構成
    const a = doc(["x1", "A", "x2"]);
    const b = doc(["y1", "A", "y2"]);
    const { aRuns } = computeBlockCollapsePlan(a, b, 0);
    // A だけが未変更だが len1 → 畳まない
    expect(aRuns).toHaveLength(0);
  });
});
