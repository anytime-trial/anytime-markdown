/**
 * createProgressBar（ui-vanilla/ProgressBar.ts）の jsdom ユニットテスト。
 * 生成・variant 別の a11y 属性・transform・テーマ CSS 変数・update・keyframes 注入の冪等性を検証する。
 *
 * jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * テーマ変数の検証は el.style.cssText / 注入 style 内に var(--am-...) を含むことで行う。
 */
import { createProgressBar } from "@anytime-markdown/ui-core/ProgressBar";

const STYLE_ID = "am-vanilla-progressbar-keyframes";
const ROOT_CLASS = "am-vanilla-progressbar";
const BAR_CLASS = "am-vanilla-progressbar-bar";
const DETERMINATE_CLASS = "am-vanilla-progressbar-determinate";
const INDETERMINATE_CLASS = "am-vanilla-progressbar-indeterminate";

function clearKeyframeStyles(): void {
  document.querySelectorAll(`#${STYLE_ID}`).forEach((n) => n.remove());
}

beforeEach(() => {
  clearKeyframeStyles();
});

afterEach(() => {
  clearKeyframeStyles();
});

describe("createProgressBar", () => {
  it("span 要素を progressbar role で生成する", () => {
    const { el } = createProgressBar();
    expect(el.tagName).toBe("SPAN");
    expect(el.getAttribute("role")).toBe("progressbar");
    expect(el.classList.contains(ROOT_CLASS)).toBe(true);
  });

  it("内部に bar span を生成する", () => {
    const { el } = createProgressBar();
    const bar = el.querySelector(`.${BAR_CLASS}`);
    expect(bar).not.toBeNull();
    expect(bar?.tagName).toBe("SPAN");
  });

  it("ariaLabel を aria-label 属性に設定する", () => {
    const { el } = createProgressBar({ ariaLabel: "読み込み中" });
    expect(el.getAttribute("aria-label")).toBe("読み込み中");
  });

  it("ariaLabel 未指定時は aria-label を付与しない", () => {
    const { el } = createProgressBar();
    expect(el.hasAttribute("aria-label")).toBe(false);
  });

  it("className を root クラスに追加する", () => {
    const { el } = createProgressBar({ className: "custom-pb" });
    expect(el.classList.contains(ROOT_CLASS)).toBe(true);
    expect(el.classList.contains("custom-pb")).toBe(true);
  });

  it("style オプションを root に適用する", () => {
    const { el } = createProgressBar({ style: { marginTop: "8px" } });
    expect(el.style.marginTop).toBe("8px");
  });

  describe("indeterminate variant（既定）", () => {
    it("既定では indeterminate クラスを bar に付与する", () => {
      const { el } = createProgressBar();
      const bar = el.querySelector(`.${BAR_CLASS}`) as HTMLElement;
      expect(bar.classList.contains(INDETERMINATE_CLASS)).toBe(true);
      expect(bar.classList.contains(DETERMINATE_CLASS)).toBe(false);
    });

    it("aria-valuenow/min/max を付与しない", () => {
      const { el } = createProgressBar({ variant: "indeterminate" });
      expect(el.hasAttribute("aria-valuenow")).toBe(false);
      expect(el.hasAttribute("aria-valuemin")).toBe(false);
      expect(el.hasAttribute("aria-valuemax")).toBe(false);
    });

    it("bar に transform を設定しない", () => {
      const { el } = createProgressBar({ variant: "indeterminate" });
      const bar = el.querySelector(`.${BAR_CLASS}`) as HTMLElement;
      expect(bar.style.transform).toBe("");
    });
  });

  describe("determinate variant", () => {
    it("determinate クラスを bar に付与する", () => {
      const { el } = createProgressBar({ variant: "determinate", value: 50 });
      const bar = el.querySelector(`.${BAR_CLASS}`) as HTMLElement;
      expect(bar.classList.contains(DETERMINATE_CLASS)).toBe(true);
      expect(bar.classList.contains(INDETERMINATE_CLASS)).toBe(false);
    });

    it("aria-valuenow/min/max を value に応じて付与する", () => {
      const { el } = createProgressBar({ variant: "determinate", value: 42 });
      expect(el.getAttribute("aria-valuenow")).toBe("42");
      expect(el.getAttribute("aria-valuemin")).toBe("0");
      expect(el.getAttribute("aria-valuemax")).toBe("100");
    });

    it("bar に translateX(value-100%) を設定する", () => {
      const { el } = createProgressBar({ variant: "determinate", value: 30 });
      const bar = el.querySelector(`.${BAR_CLASS}`) as HTMLElement;
      expect(bar.style.transform).toBe("translateX(-70%)");
    });

    it("value を四捨五入して aria-valuenow に反映する", () => {
      const { el } = createProgressBar({ variant: "determinate", value: 33.7 });
      expect(el.getAttribute("aria-valuenow")).toBe("34");
    });

    it("value を 0–100 にクランプする", () => {
      const over = createProgressBar({ variant: "determinate", value: 150 });
      expect(over.el.getAttribute("aria-valuenow")).toBe("100");
      const under = createProgressBar({ variant: "determinate", value: -20 });
      expect(under.el.getAttribute("aria-valuenow")).toBe("0");
    });

    it("value 未指定時は 0 として扱う", () => {
      const { el } = createProgressBar({ variant: "determinate" });
      expect(el.getAttribute("aria-valuenow")).toBe("0");
      const bar = el.querySelector(`.${BAR_CLASS}`) as HTMLElement;
      expect(bar.style.transform).toBe("translateX(-100%)");
    });
  });

  describe("テーマ CSS 変数", () => {
    it("注入 style にトラック / bar のテーマ変数を含む", () => {
      createProgressBar();
      const style = document.getElementById(STYLE_ID);
      expect(style?.textContent).toContain("var(--am-color-divider)");
      expect(style?.textContent).toContain("var(--am-color-primary-main)");
    });
  });

  describe("update", () => {
    it("indeterminate から determinate に切り替えて aria 属性を付与する", () => {
      const pb = createProgressBar({ variant: "indeterminate" });
      pb.update({ variant: "determinate", value: 60 });
      const bar = pb.el.querySelector(`.${BAR_CLASS}`) as HTMLElement;
      expect(bar.classList.contains(DETERMINATE_CLASS)).toBe(true);
      expect(pb.el.getAttribute("aria-valuenow")).toBe("60");
      expect(bar.style.transform).toBe("translateX(-40%)");
    });

    it("determinate から indeterminate に切り替えて aria 属性を除去する", () => {
      const pb = createProgressBar({ variant: "determinate", value: 60 });
      pb.update({ variant: "indeterminate" });
      const bar = pb.el.querySelector(`.${BAR_CLASS}`) as HTMLElement;
      expect(bar.classList.contains(INDETERMINATE_CLASS)).toBe(true);
      expect(pb.el.hasAttribute("aria-valuenow")).toBe(false);
      expect(bar.style.transform).toBe("");
    });

    it("determinate のまま value を更新する", () => {
      const pb = createProgressBar({ variant: "determinate", value: 10 });
      pb.update({ value: 80 });
      const bar = pb.el.querySelector(`.${BAR_CLASS}`) as HTMLElement;
      expect(pb.el.getAttribute("aria-valuenow")).toBe("80");
      expect(bar.style.transform).toBe("translateX(-20%)");
    });

    it("className を差し替えても root クラスは保持する", () => {
      const pb = createProgressBar({ className: "old" });
      pb.update({ className: "new" });
      expect(pb.el.classList.contains(ROOT_CLASS)).toBe(true);
      expect(pb.el.classList.contains("new")).toBe(true);
      expect(pb.el.classList.contains("old")).toBe(false);
    });

    it("style を更新する", () => {
      const pb = createProgressBar();
      pb.update({ style: { width: "200px" } });
      expect(pb.el.style.width).toBe("200px");
    });

    it("ariaLabel を更新する", () => {
      const pb = createProgressBar({ ariaLabel: "before" });
      pb.update({ ariaLabel: "after" });
      expect(pb.el.getAttribute("aria-label")).toBe("after");
    });

    it("空オブジェクト update は既存属性を保持する", () => {
      const pb = createProgressBar({ variant: "determinate", value: 25, ariaLabel: "keep" });
      pb.update({});
      expect(pb.el.getAttribute("aria-valuenow")).toBe("25");
      expect(pb.el.getAttribute("aria-label")).toBe("keep");
    });
  });

  describe("keyframes 注入", () => {
    it("初回生成で document.head に style を 1 つ注入する", () => {
      createProgressBar();
      const styles = document.querySelectorAll(`#${STYLE_ID}`);
      expect(styles.length).toBe(1);
      expect(styles[0]?.textContent).toContain("am-progress-indeterminate");
    });

    it("複数回生成しても style は冪等で 1 つに保つ", () => {
      createProgressBar();
      createProgressBar();
      createProgressBar();
      expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
    });
  });
});
