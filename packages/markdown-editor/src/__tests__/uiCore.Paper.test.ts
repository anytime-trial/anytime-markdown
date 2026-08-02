/**
 * jsdom ユニットテスト — ui-core/Paper（脱React vanilla DOM ファクトリ）。
 *
 * 検証観点（規約）:
 * 1. DOM 生成（tagName / data 属性）
 * 2. CSS 変数応答（背景・文字・枠線・影を --am-* CSS 変数で参照）
 * 3. variant / elevation の cssText 差分
 * 4. children / className / style / role / aria-label / testId の付与
 * 5. クリーンアップ（el を parent から外しても残骸が残らない）
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * inherit の computed 検証は行わず、el.style.cssText が var(--am-...) を含むことを検証する。
 */

import { createPaper } from "@anytime-markdown/ui-core/Paper";

describe("createPaper", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("div 要素を生成する", () => {
    const { el } = createPaper();
    expect(el.tagName).toBe("DIV");
  });

  it("既定（elevation, elevation=0）で背景・文字色を CSS 変数で参照し影なし", () => {
    const { el } = createPaper();
    expect(el.getAttribute("data-variant")).toBe("elevation");
    expect(el.getAttribute("data-elevation")).toBe("0");
    expect(el.style.cssText).toContain("var(--am-color-bg-paper)");
    expect(el.style.cssText).toContain("var(--am-color-text-primary)");
    // 影なし・枠線なし
    expect(el.style.cssText).not.toContain("box-shadow");
    expect(el.style.cssText).not.toContain("var(--am-color-divider)");
  });

  it("variant=outlined で --am-color-divider の 1px ボーダーを付け影は付けない", () => {
    const { el } = createPaper({ variant: "outlined" });
    expect(el.getAttribute("data-variant")).toBe("outlined");
    // outlined では data-elevation を付けない
    expect(el.hasAttribute("data-elevation")).toBe(false);
    expect(el.style.cssText).toContain("border");
    expect(el.style.cssText).toContain("var(--am-color-divider)");
    expect(el.style.cssText).not.toContain("box-shadow");
  });

  it("elevation>0 で --am-elevation-N の box-shadow を付ける", () => {
    const { el } = createPaper({ elevation: 3 });
    expect(el.getAttribute("data-elevation")).toBe("3");
    expect(el.style.cssText).toContain("box-shadow");
    expect(el.style.cssText).toContain("var(--am-elevation-3)");
    expect(el.style.cssText).not.toContain("var(--am-color-divider)");
  });

  it("outlined + elevation 指定時は影を付けず枠線を優先する", () => {
    const { el } = createPaper({ variant: "outlined", elevation: 3 });
    expect(el.style.cssText).toContain("var(--am-color-divider)");
    expect(el.style.cssText).not.toContain("box-shadow");
  });

  it("children（string / Node / 配列）を流し込む", () => {
    const node = document.createElement("p");
    node.textContent = "node-child";
    const { el } = createPaper({ children: ["text-child", node] });
    // string は span でラップ、Node はそのまま
    const span = el.querySelector("span");
    expect(span?.textContent).toBe("text-child");
    expect(el.querySelector("p")?.textContent).toBe("node-child");
  });

  it("className / role / aria-label / testId を付与する", () => {
    const { el } = createPaper({
      className: "my-paper",
      role: "region",
      ariaLabel: "content area",
      testId: "paper-1",
    });
    expect(el.className).toBe("my-paper");
    expect(el.getAttribute("role")).toBe("region");
    expect(el.getAttribute("aria-label")).toBe("content area");
    expect(el.getAttribute("data-testid")).toBe("paper-1");
  });

  it("style は cssText の後に適用され CSS 変数参照を壊さない", () => {
    const { el } = createPaper({ style: { padding: "8px" } });
    // 追加 style が反映される
    expect(el.style.padding).toBe("8px");
    // 既定の CSS 変数参照は維持される
    expect(el.style.cssText).toContain("var(--am-color-bg-paper)");
  });

  it("parent から外しても DOM に残骸が残らない（クリーンアップ）", () => {
    const { el } = createPaper({ testId: "cleanup" });
    document.body.appendChild(el);
    expect(document.body.querySelector('[data-testid="cleanup"]')).toBe(el);
    el.remove();
    expect(document.body.querySelector('[data-testid="cleanup"]')).toBeNull();
  });
});
