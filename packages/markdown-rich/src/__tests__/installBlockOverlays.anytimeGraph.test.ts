import { renderAnytimeGraphPreviewHtml } from "../vanilla/anytimeGraphPreview";

const noopSanitize = (svg: string) => svg;

describe("renderAnytimeGraphPreviewHtml", () => {
  it("スケルトンはヒント HTML を返す（エラークラスではない）", () => {
    const html = renderAnytimeGraphPreviewHtml(
      "# サンプルから選んで",
      false,
      "ヒント文言",
      noopSanitize,
    );
    expect(html).toContain("anytime-graph-hint");
    expect(html).toContain("ヒント文言");
    expect(html).not.toContain("anytime-graph-error");
  });

  it("有効 DSL は svg を返す", () => {
    const html = renderAnytimeGraphPreviewHtml(
      "type: pyramid\n- 理念\n- 戦略",
      false,
      "x",
      noopSanitize,
    );
    expect(html).toContain("<svg");
  });

  it("本文ありの不正 DSL はエラー HTML を返す", () => {
    const html = renderAnytimeGraphPreviewHtml("- 人: a", false, "x", noopSanitize);
    expect(html).toContain("anytime-graph-error");
  });
});
