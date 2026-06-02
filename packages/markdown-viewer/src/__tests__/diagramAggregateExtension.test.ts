/**
 * diagramAggregateExtension のユニットテスト
 *
 * ツールバーの diagram 集計（hasDiagrams / allDiagramCodeCollapsed）を
 * ProseMirror Plugin state で増分維持する仕組みを検証する。
 * 全トランザクションでの doc.descendants 全走査を避けることが目的。
 */

import { Schema } from "@anytime-markdown/markdown-pm/model";
import { EditorState, TextSelection } from "@anytime-markdown/markdown-pm/state";

import {
  computeDiagramAggregate,
  createDiagramAggregatePlugin,
  getDiagramAggregate,
  stepsTouchCodeBlock,
} from "../extensions/diagramAggregateExtension";

// 最小スキーマ（doc / paragraph / text / codeBlock）
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "text*",
      toDOM: () => ["p", 0],
      parseDOM: [{ tag: "p" }],
    },
    codeBlock: {
      group: "block",
      content: "text*",
      code: true,
      attrs: { language: { default: "" }, codeCollapsed: { default: false } },
      toDOM: () => ["pre", ["code", 0]],
      parseDOM: [{ tag: "pre" }],
    },
    text: {},
  },
});

const para = (text: string) => schema.node("paragraph", null, text ? schema.text(text) : undefined);
const code = (language: string, codeCollapsed: boolean, text = "x") =>
  schema.node("codeBlock", { language, codeCollapsed }, schema.text(text));

const docOf = (...nodes: ReturnType<typeof para>[]) => schema.node("doc", null, nodes);
const stateOf = (doc: ReturnType<typeof docOf>, withPlugin = false) =>
  EditorState.create({ schema, doc, plugins: withPlugin ? [createDiagramAggregatePlugin()] : [] });

describe("computeDiagramAggregate", () => {
  it("diagram が無ければ hasDiagrams=false / allDiagramCodeCollapsed=true", () => {
    const agg = computeDiagramAggregate(docOf(para("hello"), code("js", false)));
    expect(agg.hasDiagrams).toBe(false);
    expect(agg.allDiagramCodeCollapsed).toBe(true);
  });

  it("展開された mermaid があれば hasDiagrams=true / allDiagramCodeCollapsed=false", () => {
    const agg = computeDiagramAggregate(docOf(para("a"), code("mermaid", false)));
    expect(agg.hasDiagrams).toBe(true);
    expect(agg.allDiagramCodeCollapsed).toBe(false);
  });

  it("全 diagram が折りたたみなら allDiagramCodeCollapsed=true", () => {
    const agg = computeDiagramAggregate(docOf(code("mermaid", true), code("plantuml", true)));
    expect(agg.hasDiagrams).toBe(true);
    expect(agg.allDiagramCodeCollapsed).toBe(true);
  });

  it("折りたたみ混在なら allDiagramCodeCollapsed=false", () => {
    const agg = computeDiagramAggregate(docOf(code("mermaid", true), code("plantuml", false)));
    expect(agg.allDiagramCodeCollapsed).toBe(false);
  });
});

describe("stepsTouchCodeBlock", () => {
  it("プレーンテキスト挿入では false", () => {
    const state = stateOf(docOf(para("hello")));
    const tr = state.tr.insertText("x", 1);
    expect(stepsTouchCodeBlock(tr)).toBe(false);
  });

  it("プレーンな js コードブロック内のタイピングでは false（diagram ではない）", () => {
    const state = stateOf(docOf(code("js", false, "abc")));
    const tr = state.tr.insertText("z", 2); // codeBlock 内
    expect(stepsTouchCodeBlock(tr)).toBe(false);
  });

  it("mermaid ブロックの挿入では true", () => {
    const state = stateOf(docOf(para("a")));
    const insertAt = state.doc.content.size;
    const tr = state.tr.insert(insertAt, code("mermaid", false));
    expect(stepsTouchCodeBlock(tr)).toBe(true);
  });

  it("mermaid ブロックの削除では true", () => {
    const state = stateOf(docOf(code("mermaid", false)));
    const tr = state.tr.delete(0, state.doc.content.size);
    expect(stepsTouchCodeBlock(tr)).toBe(true);
  });

  it("codeCollapsed トグル（setNodeMarkup）では true", () => {
    const state = stateOf(docOf(code("mermaid", false)));
    const tr = state.tr.setNodeMarkup(0, undefined, { language: "mermaid", codeCollapsed: true });
    expect(stepsTouchCodeBlock(tr)).toBe(true);
  });
});

describe("createDiagramAggregatePlugin", () => {
  it("初期ドキュメントから集計を計算する", () => {
    const state = stateOf(docOf(code("mermaid", false)), true);
    const agg = getDiagramAggregate(state);
    expect(agg.hasDiagrams).toBe(true);
    expect(agg.allDiagramCodeCollapsed).toBe(false);
  });

  it("選択のみの変更では集計を再計算せず参照を維持する", () => {
    const state = stateOf(docOf(code("mermaid", false), para("body")), true);
    const before = getDiagramAggregate(state);
    const tr = state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1));
    const next = state.apply(tr);
    // 同一参照 = 再計算されていない
    expect(getDiagramAggregate(next)).toBe(before);
  });

  it("diagram に無関係なプレーンテキスト編集では参照を維持する", () => {
    const state = stateOf(docOf(code("mermaid", false), para("body")), true);
    const before = getDiagramAggregate(state);
    // 末尾 paragraph の先頭付近にテキスト挿入
    const pos = state.doc.content.size - 1;
    const next = state.apply(state.tr.insertText("Z", pos));
    expect(getDiagramAggregate(next)).toBe(before);
  });

  it("codeCollapsed トグルで集計が更新される", () => {
    const state = stateOf(docOf(code("mermaid", false)), true);
    expect(getDiagramAggregate(state).allDiagramCodeCollapsed).toBe(false);
    const next = state.apply(state.tr.setNodeMarkup(0, undefined, { language: "mermaid", codeCollapsed: true }));
    expect(getDiagramAggregate(next).allDiagramCodeCollapsed).toBe(true);
  });

  it("未登録 state では getDiagramAggregate がデフォルトを返す", () => {
    const state = stateOf(docOf(code("mermaid", false)), false); // plugin なし
    const agg = getDiagramAggregate(state);
    expect(agg.hasDiagrams).toBe(false);
    expect(agg.allDiagramCodeCollapsed).toBe(true);
  });
});
