import { ensureStyle } from "../dom";

describe("ensureStyle", () => {
  afterEach(() => {
    document.querySelectorAll("style[id^='probe-']").forEach((el) => el.remove());
  });

  it("指定 id の style を head へ注入する", () => {
    ensureStyle("probe-a", ".x { color: red; }");
    const el = document.getElementById("probe-a");
    expect(el?.tagName).toBe("STYLE");
    expect(el?.textContent).toBe(".x { color: red; }");
    expect(el?.parentElement).toBe(document.head);
  });

  it("同じ id で 2 回呼んでも 1 つしか作らない（冪等）", () => {
    ensureStyle("probe-b", ".x { color: red; }");
    ensureStyle("probe-b", ".y { color: blue; }");
    expect(document.querySelectorAll("#probe-b")).toHaveLength(1);
    // 既存があれば内容を上書きしない。
    expect(document.getElementById("probe-b")?.textContent).toBe(".x { color: red; }");
  });

  it("doc を渡すとその Document へ注入する", () => {
    const other = document.implementation.createHTMLDocument("other");
    ensureStyle("probe-c", ".z { color: green; }", other);
    expect(other.getElementById("probe-c")?.textContent).toBe(".z { color: green; }");
    expect(document.getElementById("probe-c")).toBeNull();
  });

  it("doc 側でも冪等に働く", () => {
    const other = document.implementation.createHTMLDocument("other");
    ensureStyle("probe-d", ".z {}", other);
    ensureStyle("probe-d", ".z {}", other);
    expect(other.querySelectorAll("#probe-d")).toHaveLength(1);
  });
});
