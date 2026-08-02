/**
 * createButton（ui-core/Button）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / 属性 / CSS 変数応答 / イベント発火 / update / destroy のクリーンアップ。
 */

import { createButton } from "@anytime-markdown/ui-core/Button";

describe("createButton", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("button 要素を生成し label を span として持つ", () => {
    const { el } = createButton({ label: "Click me" });
    expect(el.tagName).toBe("BUTTON");
    expect(el.type).toBe("button");
    expect(el.textContent).toBe("Click me");
    expect(el.querySelector("span")?.textContent).toBe("Click me");
  });

  it("variant / color / size を data 属性と cssText に反映する", () => {
    const { el } = createButton({
      label: "Save",
      variant: "contained",
      color: "primary",
      size: "small",
    });
    expect(el.getAttribute("data-variant")).toBe("contained");
    expect(el.getAttribute("data-color")).toBe("primary");
    expect(el.getAttribute("data-size")).toBe("small");
    // contained primary → primary-main 背景 + primary-contrast 文字色（CSS 変数参照）
    expect(el.style.cssText).toContain("var(--am-color-primary-main)");
    expect(el.style.cssText).toContain("var(--am-color-primary-contrast)");
    expect(el.style.cssText).toContain("min-height: 26px");
  });

  it("text variant の error color は error-main を文字色に使う", () => {
    const { el } = createButton({ label: "Delete", variant: "text", color: "error" });
    expect(el.style.cssText).toContain("var(--am-color-error-main)");
    expect(el.style.cssText).toContain("background: transparent");
  });

  it("outlined variant は divider 枠線と text-primary を使う", () => {
    const { el } = createButton({ label: "Cancel", variant: "outlined" });
    expect(el.style.cssText).toContain("var(--am-color-divider)");
    expect(el.style.cssText).toContain("var(--am-color-text-primary)");
  });

  it("aria-label / title / data-testid / disabled の属性を設定する", () => {
    const { el } = createButton({
      label: "X",
      ariaLabel: "閉じる",
      title: "閉じる",
      testId: "close-btn",
      disabled: true,
    });
    expect(el.getAttribute("aria-label")).toBe("閉じる");
    expect(el.title).toBe("閉じる");
    expect(el.getAttribute("data-testid")).toBe("close-btn");
    expect(el.disabled).toBe(true);
  });

  it("startIcon を label の前に配置する", () => {
    const icon = document.createElement("svg");
    icon.setAttribute("data-icon", "x");
    const { el } = createButton({ label: "Add", startIcon: icon });
    expect(el.firstChild).toBe(icon);
    expect(el.lastElementChild?.textContent).toBe("Add");
  });

  it("children を string / Node / 配列で受け取る", () => {
    const node = document.createElement("b");
    node.textContent = "bold";
    const { el } = createButton({ children: ["text ", node] });
    expect(el.querySelector("span")?.textContent).toBe("text ");
    expect(el.querySelector("b")?.textContent).toBe("bold");
  });

  it("CSS 変数を documentElement に注入すると getPropertyValue で読める", () => {
    document.documentElement.style.setProperty(
      "--am-color-text-secondary",
      "rgba(0,0,0,0.6)",
    );
    const value = document.documentElement.style.getPropertyValue(
      "--am-color-text-secondary",
    );
    expect(value).toBe("rgba(0,0,0,0.6)");
    // cssText に var 参照が含まれ、変数解決の対象になる。
    const { el } = createButton({ label: "Test", color: "inherit" });
    expect(el.style.cssText).toContain("var(--am-color-text-primary)");
  });

  it("click イベントで onClick が呼ばれる", () => {
    const onClick = jest.fn();
    const { el } = createButton({ label: "Test", onClick });
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("destroy 後は click で onClick が呼ばれない", () => {
    const onClick = jest.fn();
    const { el, destroy } = createButton({ label: "Test", onClick });
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    destroy();
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe("update", () => {
    it("label を差し替える", () => {
      const { el, update } = createButton({ label: "old" });
      update({ label: "new" });
      expect(el.textContent).toBe("new");
    });

    it("disabled を切り替える", () => {
      const { el, update } = createButton({ label: "X" });
      expect(el.disabled).toBe(false);
      update({ disabled: true });
      expect(el.disabled).toBe(true);
      update({ disabled: false });
      expect(el.disabled).toBe(false);
    });

    it("variant / color を変更すると cssText と data 属性が更新される", () => {
      const { el, update } = createButton({ label: "X", variant: "text", color: "primary" });
      update({ variant: "contained", color: "error" });
      expect(el.getAttribute("data-variant")).toBe("contained");
      expect(el.getAttribute("data-color")).toBe("error");
      expect(el.style.cssText).toContain("var(--am-color-error-main)");
    });

    it("onClick を差し替えると旧ハンドラは呼ばれない", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { el, update } = createButton({ label: "X", onClick: first });
      update({ onClick: second });
      el.click();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("ariaLabel / title / className を更新する", () => {
      const { el, update } = createButton({ label: "X" });
      update({ ariaLabel: "a", title: "t", className: "c" });
      expect(el.getAttribute("aria-label")).toBe("a");
      expect(el.title).toBe("t");
      expect(el.className).toBe("c");
    });
  });
});
