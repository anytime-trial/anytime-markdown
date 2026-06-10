/**
 * createAlert（ui-vanilla/Alert）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / 属性 / severity 別背景（CSS 変数）/ アイコン描画 /
 * close イベント発火 / update / destroy のクリーンアップ。
 */

import { createAlert } from "../ui-vanilla/Alert";

describe("createAlert", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("div[role=alert] を生成し既定 severity は success", () => {
    const { el } = createAlert({ children: "Saved" });
    expect(el.tagName).toBe("DIV");
    expect(el.getAttribute("role")).toBe("alert");
    expect(el.getAttribute("data-severity")).toBe("success");
    // success-main 背景の CSS 変数を参照する。
    expect(el.style.cssText).toContain("var(--am-color-success-main)");
    expect(el.style.cssText).toContain("color: rgb(255, 255, 255)");
  });

  it("severity=error は error-main 背景を使う", () => {
    const { el } = createAlert({ severity: "error", children: "Failed" });
    expect(el.getAttribute("data-severity")).toBe("error");
    expect(el.style.cssText).toContain("var(--am-color-error-main)");
  });

  it("children を message span に設定する", () => {
    const { el } = createAlert({ children: "保存しました" });
    const message = el.querySelector("span:not([aria-hidden])");
    expect(message?.textContent).toBe("保存しました");
  });

  it("children を Node / 配列で受け取る", () => {
    const node = document.createElement("b");
    node.textContent = "bold";
    const { el } = createAlert({ children: ["text ", node] });
    const message = el.querySelector("span:not([aria-hidden])");
    expect(message?.textContent).toBe("text bold");
    expect(message?.querySelector("b")?.textContent).toBe("bold");
  });

  it("severity 別アイコンを inline SVG で描画する", () => {
    const { el } = createAlert({ severity: "success", children: "ok" });
    const iconWrap = el.querySelector('span[aria-hidden="true"]');
    const svg = iconWrap?.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("fill")).toBe("currentColor");
    expect(svg?.getAttribute("width")).toBe("22");
  });

  it("data-testid を設定する", () => {
    const { el } = createAlert({ children: "x", testId: "save-alert" });
    expect(el.getAttribute("data-testid")).toBe("save-alert");
  });

  it("className を root に付与する", () => {
    const { el } = createAlert({ children: "x", className: "custom" });
    expect(el.className).toBe("custom");
  });

  it("onClose 未指定なら close ボタンは生成されない", () => {
    const { el } = createAlert({ children: "x" });
    expect(el.querySelector('button[aria-label="Close"]')).toBeNull();
  });

  it("onClose 指定時に close ボタンを生成しクリックで callback を呼ぶ", () => {
    const onClose = jest.fn();
    const { el } = createAlert({ children: "x", onClose });
    const closeBtn = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Close"]',
    );
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.type).toBe("button");
    closeBtn?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("CSS 変数を documentElement に注入すると getPropertyValue で読める", () => {
    document.documentElement.style.setProperty(
      "--am-color-success-main",
      "rgb(46, 125, 50)",
    );
    const value = document.documentElement.style.getPropertyValue(
      "--am-color-success-main",
    );
    expect(value).toBe("rgb(46, 125, 50)");
    const { el } = createAlert({ children: "ok" });
    expect(el.style.cssText).toContain("var(--am-color-success-main)");
  });

  describe("update", () => {
    it("severity を変更すると背景・data 属性・アイコンが更新される", () => {
      const { el, update } = createAlert({ severity: "success", children: "x" });
      update({ severity: "error" });
      expect(el.getAttribute("data-severity")).toBe("error");
      expect(el.style.cssText).toContain("var(--am-color-error-main)");
      // アイコンは 1 個に保たれる（再描画で重複しない）。
      const iconWrap = el.querySelector('span[aria-hidden="true"]');
      expect(iconWrap?.querySelectorAll("svg").length).toBe(1);
    });

    it("children を差し替える", () => {
      const { el, update } = createAlert({ children: "old" });
      update({ children: "new" });
      const message = el.querySelector("span:not([aria-hidden])");
      expect(message?.textContent).toBe("new");
    });

    it("className を更新する", () => {
      const { el, update } = createAlert({ children: "x" });
      update({ className: "c2" });
      expect(el.className).toBe("c2");
    });
  });

  describe("destroy", () => {
    it("destroy 後は close クリックで callback が呼ばれない", () => {
      const onClose = jest.fn();
      const { el, destroy } = createAlert({ children: "x", onClose });
      const closeBtn = el.querySelector<HTMLButtonElement>(
        'button[aria-label="Close"]',
      );
      closeBtn?.click();
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
      closeBtn?.click();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("close ボタンなしでも destroy は安全に呼べる", () => {
      const { destroy } = createAlert({ children: "x" });
      expect(() => destroy()).not.toThrow();
    });
  });
});
