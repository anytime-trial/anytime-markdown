import { isAnytimeGraphPlaceholder } from "../utils/anytimeGraphPlaceholder";

describe("isAnytimeGraphPlaceholder", () => {
  it("コメントのみ（型未指定）は placeholder", () => {
    expect(
      isAnytimeGraphPlaceholder("# 思考法ダイアグラム — 右のサンプルから図種を選んでください"),
    ).toBe(true);
  });

  it("空白・改行のみは placeholder", () => {
    expect(isAnytimeGraphPlaceholder("   \n\n# コメント\n  ")).toBe(true);
  });

  it("type 行を含む有効 DSL は placeholder ではない", () => {
    expect(isAnytimeGraphPlaceholder("type: fishbone\nproblem: x\n- 人: a")).toBe(false);
  });

  it("型未指定だが本文を持つ（=不正 DSL）は placeholder ではない（エラー表示に委ねる）", () => {
    expect(isAnytimeGraphPlaceholder("- 人: a\n- 方法: b")).toBe(false);
  });
});
