import { parseNoteGraphDoc, parseRelated } from "../lib/noteGraphDoc";

/** frontmatter 本文（`---` 間の行）を組み立てる小ヘルパ。 */
function fm(body: string): string[] {
  return body.replace(/^\n/, "").split("\n");
}

describe("parseRelated", () => {
  it("related が無ければ空配列", () => {
    expect(parseRelated(fm(`title: A`))).toEqual([]);
  });

  it("スカラー記法 related: path", () => {
    expect(parseRelated(fm(`related: notes/b.md`))).toEqual(["notes/b.md"]);
  });

  it("インラインフロー [a, b]", () => {
    expect(parseRelated(fm(`related: [a.md, b.md]`))).toEqual(["a.md", "b.md"]);
  });

  it("ブロックの素文字列リスト", () => {
    expect(
      parseRelated(fm(`
related:
  - a.md
  - b.md`)),
    ).toEqual(["a.md", "b.md"]);
  });

  it("ブロックの型付きオブジェクト（to + type の 2 行）", () => {
    expect(
      parseRelated(fm(`
related:
  - to: a.md
    type: depends-on
  - b.md`)),
    ).toEqual([{ to: "a.md", type: "depends-on" }, "b.md"]);
  });

  it("クォートを剥がす", () => {
    expect(parseRelated(fm(`related: "quoted.md"`))).toEqual(["quoted.md"]);
    expect(
      parseRelated(fm(`
related:
  - 'x.md'`)),
    ).toEqual(["x.md"]);
  });

  it("dedent でブロックが終端する（後続キーを巻き込まない）", () => {
    expect(
      parseRelated(fm(`
related:
  - a.md
title:後続`)),
    ).toEqual(["a.md"]);
  });

  it("ネストされた related: 以外の related 部分文字列に反応しない", () => {
    // インデントされた related-ish キーはトップレベル判定で除外される
    expect(parseRelated(fm(`  related_note: x`))).toEqual([]);
  });
});

describe("parseNoteGraphDoc", () => {
  it("frontmatter が無ければ null", () => {
    expect(parseNoteGraphDoc(`# 見出しだけ`, "a.md")).toBeNull();
  });

  it("title が無ければ null（拡張パリティ）", () => {
    expect(parseNoteGraphDoc(`---\ntype: spec\n---\n本文`, "a.md")).toBeNull();
  });

  it("graph: false は非参加（null）", () => {
    expect(
      parseNoteGraphDoc(`---\ntitle: A\ngraph: false\n---`, "a.md"),
    ).toBeNull();
  });

  it("title/type/related を抽出する", () => {
    const raw = `---
title: 設計メモ
type: spec
related:
  - to: other.md
    type: refines
  - plain.md
---
本文`;
    expect(parseNoteGraphDoc(raw, "docs/design.md")).toEqual({
      path: "docs/design.md",
      title: "設計メモ",
      type: "spec",
      related: [{ to: "other.md", type: "refines" }, "plain.md"],
    });
  });

  it("related 無しでも title があれば参加（related は空配列）", () => {
    expect(parseNoteGraphDoc(`---\ntitle: A\n---`, "a.md")).toEqual({
      path: "a.md",
      title: "A",
      type: undefined,
      related: [],
    });
  });

  it("CRLF を正規化する", () => {
    expect(parseNoteGraphDoc(`---\r\ntitle: A\r\n---\r\n`, "a.md")).toEqual({
      path: "a.md",
      title: "A",
      type: undefined,
      related: [],
    });
  });
});
