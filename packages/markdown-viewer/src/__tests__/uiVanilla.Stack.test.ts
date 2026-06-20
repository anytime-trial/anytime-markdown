/**
 * jsdom ユニットテスト — ui-vanilla/Stack（脱React vanilla DOM ファクトリ）。
 *
 * 検証観点（規約）:
 * 1. DOM 生成（tagName / data 属性）
 * 2. flex レイアウトの cssText（display / flex-direction / gap / align-items / justify-content）
 * 3. spacing（MUI 単位 = ×8px）の gap 換算
 * 4. children（string / Node / 配列）の流し込み
 * 5. className / role / aria-label / testId / style の付与
 * 6. クリーンアップ（el を parent から外しても残骸が残らない）
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないが、
 * Stack はテーマ色を持たない純レイアウトのため、cssText の直接検証で十分。
 */

import { createStack } from "@anytime-markdown/ui-core/Stack";

describe("createStack", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("div 要素を生成する", () => {
    const { el } = createStack();
    expect(el.tagName).toBe("DIV");
  });

  it("既定は column 方向の flex（spacing なし）", () => {
    const { el } = createStack();
    expect(el.getAttribute("data-direction")).toBe("column");
    expect(el.getAttribute("data-spacing")).toBe("0");
    expect(el.style.cssText).toContain("display: flex");
    expect(el.style.cssText).toContain("flex-direction: column");
    // spacing 0 のため gap は付かない
    expect(el.style.cssText).not.toContain("gap");
  });

  it("direction=row を flex-direction に反映する", () => {
    const { el } = createStack({ direction: "row" });
    expect(el.getAttribute("data-direction")).toBe("row");
    expect(el.style.cssText).toContain("flex-direction: row");
  });

  it("spacing を ×8px の gap に換算する", () => {
    const { el } = createStack({ spacing: 2 });
    expect(el.getAttribute("data-spacing")).toBe("2");
    expect(el.style.cssText).toContain("gap: 16px");
  });

  it("spacing=1 は 8px の gap", () => {
    const { el } = createStack({ spacing: 1 });
    expect(el.style.cssText).toContain("gap: 8px");
  });

  it("alignItems / justifyContent を CSS 値として反映する", () => {
    const { el } = createStack({ alignItems: "center", justifyContent: "space-between" });
    expect(el.style.cssText).toContain("align-items: center");
    expect(el.style.cssText).toContain("justify-content: space-between");
  });

  it("alignItems / justifyContent 未指定時は cssText に含まれない", () => {
    const { el } = createStack();
    expect(el.style.cssText).not.toContain("align-items");
    expect(el.style.cssText).not.toContain("justify-content");
  });

  it("children（string / Node / 配列）を流し込む", () => {
    const node = document.createElement("p");
    node.textContent = "node-child";
    const { el } = createStack({ children: ["text-child", node] });
    // string は span でラップ、Node はそのまま
    const span = el.querySelector("span");
    expect(span?.textContent).toBe("text-child");
    expect(el.querySelector("p")?.textContent).toBe("node-child");
  });

  it("単一 Node の children をそのまま append する", () => {
    const node = document.createElement("button");
    const { el } = createStack({ children: node });
    expect(el.firstChild).toBe(node);
  });

  it("className / role / aria-label / testId を付与する", () => {
    const { el } = createStack({
      className: "my-stack",
      role: "group",
      ariaLabel: "actions",
      testId: "stack-1",
    });
    expect(el.className).toBe("my-stack");
    expect(el.getAttribute("role")).toBe("group");
    expect(el.getAttribute("aria-label")).toBe("actions");
    expect(el.getAttribute("data-testid")).toBe("stack-1");
  });

  it("style は cssText の後に適用され flex 設定を壊さない", () => {
    const { el } = createStack({ direction: "row", style: { padding: "8px" } });
    // 追加 style が反映される
    expect(el.style.padding).toBe("8px");
    // 既定の flex 設定は維持される
    expect(el.style.cssText).toContain("display: flex");
    expect(el.style.cssText).toContain("flex-direction: row");
  });

  it("parent から外しても DOM に残骸が残らない（クリーンアップ）", () => {
    const { el } = createStack({ testId: "cleanup" });
    document.body.appendChild(el);
    expect(document.body.querySelector('[data-testid="cleanup"]')).toBe(el);
    el.remove();
    expect(document.body.querySelector('[data-testid="cleanup"]')).toBeNull();
  });
});
