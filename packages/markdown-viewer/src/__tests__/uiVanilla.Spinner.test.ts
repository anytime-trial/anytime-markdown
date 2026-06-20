/**
 * createSpinner（ui-vanilla/Spinner.ts）の jsdom ユニットテスト。
 * 生成・属性・テーマ CSS 変数・update・keyframes 注入の冪等性を検証する。
 */
import { createSpinner } from "@anytime-markdown/graph-core/ui-vanilla/Spinner";

const STYLE_ID = "am-vanilla-spinner-keyframes";

function clearKeyframeStyles(): void {
  document.querySelectorAll(`#${STYLE_ID}`).forEach((n) => n.remove());
}

beforeEach(() => {
  clearKeyframeStyles();
  document.documentElement.style.removeProperty("--am-color-primary-main");
});

afterEach(() => {
  clearKeyframeStyles();
});

describe("createSpinner", () => {
  it("span 要素を progressbar role で生成する", () => {
    const { el } = createSpinner();
    expect(el.tagName).toBe("SPAN");
    expect(el.getAttribute("role")).toBe("progressbar");
    expect(el.classList.contains("am-vanilla-spinner")).toBe(true);
  });

  it("既定サイズ 40px を width/height に適用する", () => {
    const { el } = createSpinner();
    expect(el.style.width).toBe("40px");
    expect(el.style.height).toBe("40px");
  });

  it("size オプションを反映する", () => {
    const { el } = createSpinner({ size: 24 });
    expect(el.style.width).toBe("24px");
    expect(el.style.height).toBe("24px");
  });

  it("ariaLabel を aria-label 属性に設定する", () => {
    const { el } = createSpinner({ ariaLabel: "読み込み中" });
    expect(el.getAttribute("aria-label")).toBe("読み込み中");
  });

  it("ariaLabel 未指定時は aria-label を付与しない", () => {
    const { el } = createSpinner();
    expect(el.hasAttribute("aria-label")).toBe(false);
  });

  it("className を root クラスに追加する", () => {
    const { el } = createSpinner({ className: "custom-spin" });
    expect(el.classList.contains("am-vanilla-spinner")).toBe(true);
    expect(el.classList.contains("custom-spin")).toBe(true);
  });

  it("内部に SVG + circle を生成する（MUI 同等の幾何）", () => {
    const { el } = createSpinner();
    const svg = el.querySelector("svg");
    const circle = el.querySelector("circle");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("22 22 44 44");
    expect(circle?.getAttribute("cx")).toBe("44");
    expect(circle?.getAttribute("cy")).toBe("44");
    expect(circle?.getAttribute("r")).toBe("20.2");
    expect(circle?.getAttribute("fill")).toBe("none");
    expect(circle?.getAttribute("stroke-width")).toBe("3.6");
  });

  describe("color オプション", () => {
    it("既定 primary は --am-color-primary-main を参照する", () => {
      const { el } = createSpinner();
      expect(el.style.color).toBe("var(--am-color-primary-main)");
    });

    it("inherit は color:inherit にする", () => {
      const { el } = createSpinner({ color: "inherit" });
      expect(el.style.color).toBe("inherit");
    });

    it("primary 指定時に CSS 変数が computed color に反映される", () => {
      document.documentElement.style.setProperty(
        "--am-color-primary-main",
        "rgb(25, 118, 210)",
      );
      const { el } = createSpinner({ color: "primary" });
      document.body.appendChild(el);
      const color = window.getComputedStyle(el).getPropertyValue("color");
      // jsdom は var() を解決しないことがあるため、変数自体の存在も確認する。
      const varValue = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--am-color-primary-main");
      expect(varValue.trim()).toBe("rgb(25, 118, 210)");
      expect(color === "rgb(25, 118, 210)" || el.style.color.includes("--am-color-primary-main")).toBe(
        true,
      );
      el.remove();
    });
  });

  describe("update", () => {
    it("size を更新する", () => {
      const spinner = createSpinner({ size: 40 });
      spinner.update({ size: 16 });
      expect(spinner.el.style.width).toBe("16px");
      expect(spinner.el.style.height).toBe("16px");
    });

    it("color を primary から inherit に切り替える", () => {
      const spinner = createSpinner({ color: "primary" });
      spinner.update({ color: "inherit" });
      expect(spinner.el.style.color).toBe("inherit");
    });

    it("ariaLabel を更新する", () => {
      const spinner = createSpinner({ ariaLabel: "before" });
      spinner.update({ ariaLabel: "after" });
      expect(spinner.el.getAttribute("aria-label")).toBe("after");
    });

    it("className を差し替えても root クラスは保持する", () => {
      const spinner = createSpinner({ className: "old" });
      spinner.update({ className: "new" });
      expect(spinner.el.classList.contains("am-vanilla-spinner")).toBe(true);
      expect(spinner.el.classList.contains("new")).toBe(true);
      expect(spinner.el.classList.contains("old")).toBe(false);
    });

    it("空オブジェクト update は既存属性を保持する", () => {
      const spinner = createSpinner({ size: 32, ariaLabel: "keep" });
      spinner.update({});
      expect(spinner.el.style.width).toBe("32px");
      expect(spinner.el.getAttribute("aria-label")).toBe("keep");
    });
  });

  describe("keyframes 注入", () => {
    it("初回生成で document.head に style を 1 つ注入する", () => {
      createSpinner();
      const styles = document.querySelectorAll(`#${STYLE_ID}`);
      expect(styles.length).toBe(1);
      expect(styles[0]?.textContent).toContain("am-spinner-rotate");
      expect(styles[0]?.textContent).toContain("am-spinner-dash");
    });

    it("複数回生成しても style は冪等で 1 つに保つ", () => {
      createSpinner();
      createSpinner();
      createSpinner();
      expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
    });
  });
});
