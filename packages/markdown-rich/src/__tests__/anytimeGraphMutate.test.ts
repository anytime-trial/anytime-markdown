import { parseGraphDsl } from "@anytime-markdown/graph-core";
import { applyAnytimeGraphOp, AnytimeGraphMutateError } from "../vanilla/anytimeGraphMutate";
import type { AnytimeGraphOp } from "../vanilla/anytimeGraphMutate";

/** 操作を適用した後の DSL を再パースした spec を返す。 */
function apply(dsl: string, op: AnytimeGraphOp): ReturnType<typeof parseGraphDsl> {
  return parseGraphDsl(applyAnytimeGraphOp(dsl, op));
}

describe("anytimeGraphMutate", () => {
  describe("setLabel", () => {
    it("fishbone の problem を変更する", () => {
      const spec = apply("type: fishbone\nproblem: 旧\n- 人: a", { kind: "setLabel", path: "problem", value: "新" });
      expect(spec.type === "fishbone" && spec.problem).toBe("新");
    });

    it("fishbone カテゴリのラベルを変更する", () => {
      const spec = apply("type: fishbone\nproblem: P\n- 人: a", { kind: "setLabel", path: "categories.0", value: "環境" });
      if (spec.type === "fishbone") expect(spec.categories[0].label).toBe("環境");
    });

    it("mindmap の入れ子ノードのラベルを変更する", () => {
      const dsl = ["type: mindmap", "root: R", "- b0", "  - c0", "  - c1"].join("\n");
      const spec = apply(dsl, { kind: "setLabel", path: "branches.0.children.1", value: "C1" });
      if (spec.type === "mindmap") expect(spec.branches[0].children?.[1].label).toBe("C1");
    });

    it("causal-loop の変数をリンク全体で改名する", () => {
      const dsl = ["type: causal-loop", "在庫 -> 出荷: +", "出荷 -> 在庫: -"].join("\n");
      // 変数順: 在庫(0), 出荷(1)。在庫 を rename。
      const spec = apply(dsl, { kind: "setLabel", path: "variables.0", value: "在庫量" });
      if (spec.type === "causal-loop") {
        expect(spec.links).toEqual([
          { from: "在庫量", to: "出荷", polarity: "+" },
          { from: "出荷", to: "在庫量", polarity: "-" },
        ]);
      }
    });
  });

  describe("remove", () => {
    it("fishbone カテゴリを削除する", () => {
      const dsl = "type: fishbone\nproblem: P\n- 人: a\n- 機械: b";
      const spec = apply(dsl, { kind: "remove", path: "categories.0" });
      if (spec.type === "fishbone") {
        expect(spec.categories.map((c) => c.label)).toEqual(["機械"]);
      }
    });

    it("affinity の付箋を削除する", () => {
      const dsl = "type: affinity\n- g0: n0, n1, n2";
      const spec = apply(dsl, { kind: "remove", path: "groups.0.notes.1" });
      if (spec.type === "affinity") expect(spec.groups[0].notes).toEqual(["n0", "n2"]);
    });

    it("causal-loop の変数を消すと関連リンクが消える", () => {
      const dsl = ["type: causal-loop", "A -> B: +", "B -> C: -", "C -> A: +"].join("\n");
      // 変数 B(index1) を削除 → B を含むリンク (A->B, B->C) が消え C->A のみ残る
      const spec = apply(dsl, { kind: "remove", path: "variables.1" });
      if (spec.type === "causal-loop") {
        expect(spec.links).toEqual([{ from: "C", to: "A", polarity: "+" }]);
      }
    });

    it("scalar フィールド（problem）は削除できない", () => {
      expect(() => applyAnytimeGraphOp("type: fishbone\nproblem: P\n- 人: a", { kind: "remove", path: "problem" })).toThrow(
        AnytimeGraphMutateError,
      );
    });
  });

  describe("addSibling", () => {
    it("fishbone カテゴリの兄弟を追加する（空 causes）", () => {
      const dsl = "type: fishbone\nproblem: P\n- 人: a";
      const spec = apply(dsl, { kind: "addSibling", path: "categories.0", value: "機械" });
      if (spec.type === "fishbone") {
        expect(spec.categories).toEqual([
          { label: "人", causes: ["a"] },
          { label: "機械", causes: [] },
        ]);
      }
    });

    it("affinity の付箋（文字列要素）の兄弟を追加する", () => {
      const dsl = "type: affinity\n- g0: n0";
      const spec = apply(dsl, { kind: "addSibling", path: "groups.0.notes.0", value: "n1" });
      if (spec.type === "affinity") expect(spec.groups[0].notes).toEqual(["n0", "n1"]);
    });

    it("why-chain のステップ兄弟を追加する", () => {
      const dsl = "type: why-chain\nproblem: P\n- s0";
      const spec = apply(dsl, { kind: "addSibling", path: "steps.0", value: "s1" });
      if (spec.type === "why-chain") expect(spec.steps).toEqual(["s0", "s1"]);
    });
  });

  describe("addChild", () => {
    it("mindmap の root にブランチを追加する", () => {
      const dsl = "type: mindmap\nroot: R\n- b0";
      const spec = apply(dsl, { kind: "addChild", path: "root", value: "b1" });
      if (spec.type === "mindmap") expect(spec.branches.map((b) => b.label)).toEqual(["b0", "b1"]);
    });

    it("logic-tree のノードに子を追加する", () => {
      const dsl = "type: logic-tree\nroot: R\n- c0";
      const spec = apply(dsl, { kind: "addChild", path: "children.0", value: "g0" });
      if (spec.type === "logic-tree") expect(spec.children[0].children?.map((c) => c.label)).toEqual(["g0"]);
    });

    it("morph-box のパラメータに選択肢を追加する", () => {
      const dsl = "type: morph-box\n- p0: o0";
      const spec = apply(dsl, { kind: "addChild", path: "parameters.0", value: "o1" });
      if (spec.type === "morph-box") expect(spec.parameters[0].options).toEqual(["o0", "o1"]);
    });
  });

  describe("集約リーフ (setItem / removeItem / addItem)", () => {
    it("fishbone の cause を編集する", () => {
      const dsl = "type: fishbone\nproblem: P\n- 人: a, b";
      const spec = apply(dsl, { kind: "setItem", path: "categories.0", index: 1, value: "B" });
      if (spec.type === "fishbone") expect(spec.categories[0].causes).toEqual(["a", "B"]);
    });

    it("double-diamond のフェーズに項目を追加する", () => {
      const dsl = "type: double-diamond\ndiscover: x";
      const spec = apply(dsl, { kind: "addItem", path: "discover", value: "y" });
      if (spec.type === "double-diamond") expect(spec.discover).toEqual(["x", "y"]);
    });

    it("swot の象限から項目を削除する", () => {
      const dsl = "type: swot\nstrengths: a, b, c";
      const spec = apply(dsl, { kind: "removeItem", path: "strengths", index: 0 });
      if (spec.type === "swot") expect(spec.strengths).toEqual(["b", "c"]);
    });

    it("空フェーズへ最初の項目を追加できる", () => {
      const dsl = "type: swot\nstrengths: a";
      const spec = apply(dsl, { kind: "addItem", path: "threats", value: "競合" });
      if (spec.type === "swot") expect(spec.threats).toEqual(["競合"]);
    });
  });

  describe("setDesc (pyramid)", () => {
    it("tier の説明を設定する", () => {
      const dsl = "type: pyramid\n- 理念\n- 戦略";
      const spec = apply(dsl, { kind: "setDesc", path: "tiers.0", value: "長期" });
      if (spec.type === "pyramid") expect(spec.tiers[0].desc).toBe("長期");
    });

    it("空文字で説明を消す", () => {
      const dsl = "type: pyramid\n- 理念: 長期";
      const spec = apply(dsl, { kind: "setDesc", path: "tiers.0", value: "" });
      if (spec.type === "pyramid") expect(spec.tiers[0].desc).toBeUndefined();
    });
  });

  it("生成 DSL は常に再パース可能", () => {
    const dsl = "type: affinity\n- g0: n0, n1";
    const out = applyAnytimeGraphOp(dsl, { kind: "addChild", path: "groups.0", value: "n2" });
    expect(() => parseGraphDsl(out)).not.toThrow();
  });
});
