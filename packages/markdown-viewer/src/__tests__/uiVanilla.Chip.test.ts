/**
 * createChip（ui-vanilla/Chip）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / 属性 / CSS 変数応答 / clickable a11y / イベント発火（click + Enter/Space）
 * / update / destroy のクリーンアップ。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * inherit の computed 検証は行わず、el.style.cssText が var(--am-...) を含むことを検証する。
 */

import { createChip } from "@anytime-markdown/ui-core/Chip";

describe("createChip", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("div 要素を生成し label を span として持つ", () => {
    const { el } = createChip({ label: "Tag" });
    expect(el.tagName).toBe("DIV");
    expect(el.textContent).toBe("Tag");
    expect(el.querySelector("span")?.textContent).toBe("Tag");
  });

  it("既定は filled / medium で data 属性と cssText に反映する", () => {
    const { el } = createChip({ label: "Tag" });
    expect(el.getAttribute("data-variant")).toBe("filled");
    expect(el.getAttribute("data-size")).toBe("medium");
    // filled → action-selected 背景（CSS 変数参照）
    expect(el.style.cssText).toContain("var(--am-color-action-selected)");
    expect(el.style.cssText).toContain("var(--am-color-text-primary)");
    expect(el.style.cssText).toContain("height: 32px");
  });

  it("outlined variant は divider 枠線を使う", () => {
    const { el } = createChip({ label: "Tag", variant: "outlined" });
    expect(el.style.cssText).toContain("var(--am-color-divider)");
    // outlined は filled の背景色を持たない
    expect(el.style.cssText).not.toContain("var(--am-color-action-selected)");
  });

  it("small size は height 24px を使う", () => {
    const { el } = createChip({ label: "Tag", size: "small" });
    expect(el.getAttribute("data-size")).toBe("small");
    expect(el.style.cssText).toContain("height: 24px");
  });

  it("className / testId の属性を設定する", () => {
    const { el } = createChip({ label: "Tag", className: "my-chip", testId: "chip-1" });
    expect(el.className).toBe("my-chip");
    expect(el.getAttribute("data-testid")).toBe("chip-1");
  });

  it("label を string / Node / 配列で受け取る", () => {
    const node = document.createElement("b");
    node.textContent = "bold";
    const { el } = createChip({ label: ["text ", node] });
    const span = el.querySelector("span");
    expect(span?.querySelector("b")?.textContent).toBe("bold");
    expect(el.textContent).toBe("text bold");
  });

  it("CSS 変数を documentElement に注入すると getPropertyValue で読める", () => {
    document.documentElement.style.setProperty(
      "--am-color-action-selected",
      "rgba(0,0,0,0.08)",
    );
    expect(
      document.documentElement.style.getPropertyValue("--am-color-action-selected"),
    ).toBe("rgba(0,0,0,0.08)");
    const { el } = createChip({ label: "Tag" });
    expect(el.style.cssText).toContain("var(--am-color-action-selected)");
  });

  describe("clickable（onClick あり）", () => {
    it("role=button / tabIndex=0 / cursor:pointer を付与する", () => {
      const { el } = createChip({ label: "Tag", onClick: jest.fn() });
      expect(el.getAttribute("role")).toBe("button");
      expect(el.tabIndex).toBe(0);
      expect(el.style.cssText).toContain("cursor: pointer");
    });

    it("click で onClick が呼ばれる", () => {
      const onClick = jest.fn();
      const { el } = createChip({ label: "Tag", onClick });
      el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("Enter キーで onClick が呼ばれ preventDefault される", () => {
      const onClick = jest.fn();
      const { el } = createChip({ label: "Tag", onClick });
      const ev = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
      el.dispatchEvent(ev);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(ev.defaultPrevented).toBe(true);
    });

    it("Space キーで onClick が呼ばれ preventDefault される", () => {
      const onClick = jest.fn();
      const { el } = createChip({ label: "Tag", onClick });
      const ev = new KeyboardEvent("keydown", { key: " ", cancelable: true });
      el.dispatchEvent(ev);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(ev.defaultPrevented).toBe(true);
    });

    it("関係ないキーでは onClick が呼ばれない", () => {
      const onClick = jest.fn();
      const { el } = createChip({ label: "Tag", onClick });
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", cancelable: true }));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("non-clickable（onClick なし）", () => {
    it("role / tabindex を付与しない", () => {
      const { el } = createChip({ label: "Tag" });
      expect(el.hasAttribute("role")).toBe(false);
      expect(el.hasAttribute("tabindex")).toBe(false);
      expect(el.style.cssText).not.toContain("cursor: pointer");
    });

    it("Enter キーを押しても何も起きない", () => {
      const { el } = createChip({ label: "Tag" });
      const ev = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
      el.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    });
  });

  describe("update", () => {
    it("label を差し替える", () => {
      const { el, update } = createChip({ label: "old" });
      update({ label: "new" });
      expect(el.textContent).toBe("new");
    });

    it("variant / size を変更すると cssText と data 属性が更新される", () => {
      const { el, update } = createChip({ label: "Tag", variant: "filled", size: "medium" });
      update({ variant: "outlined", size: "small" });
      expect(el.getAttribute("data-variant")).toBe("outlined");
      expect(el.getAttribute("data-size")).toBe("small");
      expect(el.style.cssText).toContain("var(--am-color-divider)");
      expect(el.style.cssText).toContain("height: 24px");
    });

    it("className を更新する", () => {
      const { el, update } = createChip({ label: "Tag" });
      update({ className: "c" });
      expect(el.className).toBe("c");
    });

    it("onClick を後付けすると clickable になる", () => {
      const onClick = jest.fn();
      const { el, update } = createChip({ label: "Tag" });
      expect(el.hasAttribute("role")).toBe(false);
      update({ onClick });
      expect(el.getAttribute("role")).toBe("button");
      expect(el.tabIndex).toBe(0);
      expect(el.style.cssText).toContain("cursor: pointer");
      el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("onClick を差し替えると旧ハンドラは呼ばれない", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { el, update } = createChip({ label: "Tag", onClick: first });
      update({ onClick: second });
      el.click();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  describe("destroy", () => {
    it("destroy 後は click で onClick が呼ばれない", () => {
      const onClick = jest.fn();
      const { el, destroy } = createChip({ label: "Tag", onClick });
      el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
      destroy();
      el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("destroy 後は Enter キーで onClick が呼ばれない", () => {
      const onClick = jest.fn();
      const { el, destroy } = createChip({ label: "Tag", onClick });
      destroy();
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
