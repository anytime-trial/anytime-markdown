/**
 * jsdom ユニットテスト — ui-vanilla/Divider（脱React vanilla DOM ファクトリ）。
 *
 * 検証観点（規約 6）:
 * 1. DOM 生成（tagName / role / data 属性）
 * 2. CSS 変数応答（--am-color-divider をテーマ追従）
 * 3. orientation / flexItem の style 差分
 * 4. className / aria-label の付与
 * 5. クリーンアップ（el を parent から外しても残骸が残らない）
 */

import { createDivider } from "@anytime-markdown/graph-core/ui-vanilla/Divider";

describe("createDivider", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--am-color-divider");
    document.body.innerHTML = "";
  });

  it("hr 要素を role=separator で生成する", () => {
    const { el } = createDivider();
    expect(el.tagName).toBe("HR");
    expect(el.getAttribute("role")).toBe("separator");
  });

  it("既定で horizontal の style と属性を持つ", () => {
    const { el } = createDivider();
    expect(el.getAttribute("aria-orientation")).toBe("horizontal");
    expect(el.getAttribute("data-orientation")).toBe("horizontal");
    expect(el.style.height).toBe("1px");
    expect(el.style.width).toBe("100%");
    // テーマ色は CSS 変数経由
    expect(el.style.backgroundColor).toBe("var(--am-color-divider)");
    // 既定では flexItem 属性なし
    expect(el.hasAttribute("data-flex-item")).toBe(false);
  });

  it("orientation=vertical で縦向きの style と属性を持つ", () => {
    const { el } = createDivider({ orientation: "vertical" });
    expect(el.getAttribute("aria-orientation")).toBe("vertical");
    expect(el.getAttribute("data-orientation")).toBe("vertical");
    expect(el.style.width).toBe("1px");
    expect(el.style.alignSelf).toBe("stretch");
    expect(el.style.height).toBe("auto");
  });

  it("flexItem=true で align-self:stretch と data-flex-item を付ける", () => {
    const { el } = createDivider({ flexItem: true });
    expect(el.style.alignSelf).toBe("stretch");
    expect(el.hasAttribute("data-flex-item")).toBe(true);
  });

  it("className / aria-label を付与する", () => {
    const { el } = createDivider({ className: "my-divider", ariaLabel: "section break" });
    expect(el.className).toBe("my-divider");
    expect(el.getAttribute("aria-label")).toBe("section break");
  });

  it("CSS 変数 --am-color-divider がテーマ追従する（getComputedStyle）", () => {
    document.documentElement.style.setProperty("--am-color-divider", "rgba(0, 0, 0, 0.12)");
    const { el } = createDivider();
    document.body.appendChild(el);
    const value = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--am-color-divider");
    expect(value.trim()).toBe("rgba(0, 0, 0, 0.12)");
    // background-color は CSS 変数を参照している
    expect(el.style.backgroundColor).toBe("var(--am-color-divider)");
  });

  it("parent から外しても DOM に残骸が残らない（クリーンアップ）", () => {
    const { el } = createDivider();
    document.body.appendChild(el);
    expect(document.body.querySelector("hr")).toBe(el);
    el.remove();
    expect(document.body.querySelector("hr")).toBeNull();
  });
});
