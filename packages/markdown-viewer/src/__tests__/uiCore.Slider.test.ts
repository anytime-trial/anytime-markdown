/**
 * createSlider（ui-core/Slider.ts）の jsdom ユニットテスト。
 * 生成・属性（min/max/step/value）・a11y 属性・--slider-fill 算出・input イベント発火・
 * テーマ CSS 変数・update・destroy のクリーンアップ・style 注入の冪等性を検証する。
 *
 * jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * テーマ変数の検証は注入 style 内に var(--am-...) を含むことで行う（computed 検証は禁止）。
 */
import { createSlider } from "@anytime-markdown/ui-core/Slider";

const STYLE_ID = "am-vanilla-slider-styles";
const ROOT_CLASS = "am-vanilla-slider";
const SMALL_CLASS = "am-vanilla-slider-small";
const MEDIUM_CLASS = "am-vanilla-slider-medium";

function clearStyles(): void {
  document.querySelectorAll(`#${STYLE_ID}`).forEach((n) => n.remove());
}

beforeEach(() => {
  clearStyles();
});

afterEach(() => {
  clearStyles();
});

describe("createSlider", () => {
  describe("生成", () => {
    it("input[type=range] を ROOT クラス付きで生成する", () => {
      const { el } = createSlider({ value: 50 });
      expect(el.tagName).toBe("INPUT");
      expect(el.type).toBe("range");
      expect(el.classList.contains(ROOT_CLASS)).toBe(true);
    });

    it("既定で min=0 / max=100 / step=1 を設定する", () => {
      const { el } = createSlider({ value: 50 });
      expect(el.min).toBe("0");
      expect(el.max).toBe("100");
      expect(el.step).toBe("1");
    });

    it("value を input.value に設定する", () => {
      const { el } = createSlider({ value: 42 });
      expect(el.value).toBe("42");
    });

    it("min/max/step を指定値で設定する", () => {
      const { el } = createSlider({ value: 5, min: 1, max: 10, step: 0.5 });
      expect(el.min).toBe("1");
      expect(el.max).toBe("10");
      expect(el.step).toBe("0.5");
    });

    it("既定では medium サイズクラスを付与する", () => {
      const { el } = createSlider({ value: 50 });
      expect(el.classList.contains(MEDIUM_CLASS)).toBe(true);
      expect(el.classList.contains(SMALL_CLASS)).toBe(false);
    });

    it("size=small で small サイズクラスを付与する", () => {
      const { el } = createSlider({ value: 50, size: "small" });
      expect(el.classList.contains(SMALL_CLASS)).toBe(true);
      expect(el.classList.contains(MEDIUM_CLASS)).toBe(false);
    });

    it("className を追加付与する（ROOT は保持）", () => {
      const { el } = createSlider({ value: 50, className: "custom-slider" });
      expect(el.classList.contains(ROOT_CLASS)).toBe(true);
      expect(el.classList.contains("custom-slider")).toBe(true);
    });

    it("style オプションを root に適用する", () => {
      const { el } = createSlider({ value: 50, style: { width: "120px" } });
      expect(el.style.width).toBe("120px");
    });
  });

  describe("a11y 属性", () => {
    it("ariaLabel を aria-label に設定する", () => {
      const { el } = createSlider({ value: 50, ariaLabel: "ズーム" });
      expect(el.getAttribute("aria-label")).toBe("ズーム");
    });

    it("ariaValueText を aria-valuetext に設定する", () => {
      const { el } = createSlider({ value: 50, ariaValueText: "50%" });
      expect(el.getAttribute("aria-valuetext")).toBe("50%");
    });

    it("未指定時は aria 属性を付与しない", () => {
      const { el } = createSlider({ value: 50 });
      expect(el.hasAttribute("aria-label")).toBe(false);
      expect(el.hasAttribute("aria-valuetext")).toBe(false);
    });
  });

  describe("--slider-fill 算出", () => {
    it("中央値で 50% を設定する", () => {
      const { el } = createSlider({ value: 50, min: 0, max: 100 });
      expect(el.style.getPropertyValue("--slider-fill")).toBe("50%");
    });

    it("min/max が任意レンジでも比率で算出する", () => {
      const { el } = createSlider({ value: 5, min: 0, max: 20 });
      expect(el.style.getPropertyValue("--slider-fill")).toBe("25%");
    });

    it("min 値で 0% を設定する", () => {
      const { el } = createSlider({ value: 0, min: 0, max: 100 });
      expect(el.style.getPropertyValue("--slider-fill")).toBe("0%");
    });

    it("max 値で 100% を設定する", () => {
      const { el } = createSlider({ value: 100, min: 0, max: 100 });
      expect(el.style.getPropertyValue("--slider-fill")).toBe("100%");
    });

    it("max <= min のとき 0% を設定する", () => {
      const { el } = createSlider({ value: 5, min: 10, max: 10 });
      expect(el.style.getPropertyValue("--slider-fill")).toBe("0%");
    });

    it("レンジ外の value を 0–100% にクランプする", () => {
      const over = createSlider({ value: 150, min: 0, max: 100 });
      expect(over.el.style.getPropertyValue("--slider-fill")).toBe("100%");
      const under = createSlider({ value: -50, min: 0, max: 100 });
      expect(under.el.style.getPropertyValue("--slider-fill")).toBe("0%");
    });

    it("inline style に var(--slider-fill) を含む（cssText 検証）", () => {
      const { el } = createSlider({ value: 50 });
      expect(el.style.cssText).toContain("--slider-fill");
    });
  });

  describe("input イベント", () => {
    it("input 発火で onChange に新 value を渡す", () => {
      const onChange = jest.fn();
      const { el } = createSlider({ value: 50, onChange });
      el.value = "70";
      el.dispatchEvent(new Event("input"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toBe(70);
      expect(onChange.mock.calls[0][1]).toBeInstanceOf(Event);
    });

    it("input 発火で --slider-fill が追従する", () => {
      const { el } = createSlider({ value: 0, min: 0, max: 100 });
      el.value = "30";
      el.dispatchEvent(new Event("input"));
      expect(el.style.getPropertyValue("--slider-fill")).toBe("30%");
    });

    it("onChange 未指定でも input 発火でエラーにならない", () => {
      const { el } = createSlider({ value: 50 });
      el.value = "60";
      expect(() => el.dispatchEvent(new Event("input"))).not.toThrow();
      expect(el.style.getPropertyValue("--slider-fill")).toBe("60%");
    });
  });

  describe("テーマ CSS 変数", () => {
    it("注入 style に rail / track / thumb のテーマ変数を含む", () => {
      createSlider({ value: 50 });
      const style = document.getElementById(STYLE_ID);
      expect(style?.textContent).toContain("var(--am-color-primary-main)");
      expect(style?.textContent).toContain("var(--am-color-slider-rail)");
    });
  });

  describe("update", () => {
    it("value を更新して input.value と fill を反映する", () => {
      const s = createSlider({ value: 10, min: 0, max: 100 });
      s.update({ value: 80 });
      expect(s.el.value).toBe("80");
      expect(s.el.style.getPropertyValue("--slider-fill")).toBe("80%");
    });

    it("min/max を更新して fill を再算出する", () => {
      const s = createSlider({ value: 5, min: 0, max: 100 });
      s.update({ min: 0, max: 10 });
      expect(s.el.min).toBe("0");
      expect(s.el.max).toBe("10");
      expect(s.el.style.getPropertyValue("--slider-fill")).toBe("50%");
    });

    it("step を更新する", () => {
      const s = createSlider({ value: 50 });
      s.update({ step: 5 });
      expect(s.el.step).toBe("5");
    });

    it("size を更新してサイズクラスを差し替える", () => {
      const s = createSlider({ value: 50, size: "medium" });
      s.update({ size: "small" });
      expect(s.el.classList.contains(SMALL_CLASS)).toBe(true);
      expect(s.el.classList.contains(MEDIUM_CLASS)).toBe(false);
    });

    it("className を差し替えても ROOT / size クラスは保持する", () => {
      const s = createSlider({ value: 50, className: "old" });
      s.update({ className: "new" });
      expect(s.el.classList.contains(ROOT_CLASS)).toBe(true);
      expect(s.el.classList.contains(MEDIUM_CLASS)).toBe(true);
      expect(s.el.classList.contains("new")).toBe(true);
      expect(s.el.classList.contains("old")).toBe(false);
    });

    it("style を更新する", () => {
      const s = createSlider({ value: 50 });
      s.update({ style: { marginTop: "4px" } });
      expect(s.el.style.marginTop).toBe("4px");
    });

    it("aria 属性を更新する", () => {
      const s = createSlider({ value: 50, ariaLabel: "before", ariaValueText: "50%" });
      s.update({ ariaLabel: "after", ariaValueText: "60%" });
      expect(s.el.getAttribute("aria-label")).toBe("after");
      expect(s.el.getAttribute("aria-valuetext")).toBe("60%");
    });

    it("onChange を差し替えて新ハンドラを呼ぶ", () => {
      const first = jest.fn();
      const second = jest.fn();
      const s = createSlider({ value: 50, onChange: first });
      s.update({ onChange: second });
      s.el.value = "70";
      s.el.dispatchEvent(new Event("input"));
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("空オブジェクト update は既存属性を保持する", () => {
      const s = createSlider({ value: 25, ariaLabel: "keep" });
      s.update({});
      expect(s.el.value).toBe("25");
      expect(s.el.getAttribute("aria-label")).toBe("keep");
    });
  });

  describe("destroy", () => {
    it("destroy 後は input リスナが解除され onChange が呼ばれない", () => {
      const onChange = jest.fn();
      const s = createSlider({ value: 50, onChange });
      s.destroy();
      s.el.value = "70";
      s.el.dispatchEvent(new Event("input"));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("style 注入", () => {
    it("初回生成で document.head に style を 1 つ注入する", () => {
      createSlider({ value: 50 });
      const styles = document.querySelectorAll(`#${STYLE_ID}`);
      expect(styles.length).toBe(1);
      expect(styles[0]?.textContent).toContain("-webkit-slider-runnable-track");
    });

    it("複数回生成しても style は冪等で 1 つに保つ", () => {
      createSlider({ value: 10 });
      createSlider({ value: 20 });
      createSlider({ value: 30 });
      expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
    });
  });
});
