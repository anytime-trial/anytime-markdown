import {
  ArrowDownward,
  Close,
  DeleteSweep,
  ScatterPlot,
  SmartToy,
  TrendingUp,
} from "../icons";

describe("icons factory", () => {
  describe("data-testid", () => {
    it("ArrowDownward: data-testid が ArrowDownwardIcon", () => {
      const { el } = ArrowDownward();
      expect(el.getAttribute("data-testid")).toBe("ArrowDownwardIcon");
    });
    it("Close: data-testid が CloseIcon", () => {
      const { el } = Close();
      expect(el.getAttribute("data-testid")).toBe("CloseIcon");
    });
    it("TrendingUp: data-testid が TrendingUpIcon", () => {
      const { el } = TrendingUp();
      expect(el.getAttribute("data-testid")).toBe("TrendingUpIcon");
    });
  });

  describe("fontSize", () => {
    it('fontSize="small" → style.fontSize が 1.25rem', () => {
      const { el } = ArrowDownward({ fontSize: "small" });
      expect(el.style.fontSize).toBe("1.25rem");
    });
    it('fontSize="medium" → style.fontSize が 1.5rem', () => {
      const { el } = ArrowDownward({ fontSize: "medium" });
      expect(el.style.fontSize).toBe("1.5rem");
    });
    it('fontSize="large" → style.fontSize が 2.1875rem', () => {
      const { el } = ArrowDownward({ fontSize: "large" });
      expect(el.style.fontSize).toBe("2.1875rem");
    });
    it("fontSize=24 (number) → style.fontSize が 24px", () => {
      const { el } = ArrowDownward({ fontSize: 24 });
      expect(el.style.fontSize).toBe("24px");
    });
    it("fontSize 未指定 → 既定 1.5rem", () => {
      const { el } = ArrowDownward();
      expect(el.style.fontSize).toBe("1.5rem");
    });
  });

  describe("color", () => {
    it('color="primary" → style.color に --am-color-primary-main が含まれる', () => {
      const { el } = Close({ color: "primary" });
      expect(el.style.color).toContain("--am-color");
    });
    it('color="error" → style.color に --am-color-error-main が含まれる', () => {
      const { el } = Close({ color: "error" });
      expect(el.style.color).toContain("--am-color-error-main");
    });
    it('color="inherit" → style.color が inherit', () => {
      const { el } = Close({ color: "inherit" });
      expect(el.style.color).toBe("inherit");
    });
    it("color 未指定 → style.color が空", () => {
      const { el } = Close();
      expect(el.style.color).toBe("");
    });
    it("color に生の CSS 色を渡すとそのまま適用される", () => {
      const { el } = TrendingUp({ color: "#ff0000" });
      expect(el.style.color).toBe("rgb(255, 0, 0)");
    });
  });

  describe("multi-path icon (DeleteSweep)", () => {
    it("2 つの <path> 要素を持つ", () => {
      const { el } = DeleteSweep();
      const paths = el.querySelectorAll("path");
      expect(paths).toHaveLength(2);
    });
  });

  describe("circle-based icon (ScatterPlot)", () => {
    it("3 つの <circle> 要素を持つ", () => {
      const { el } = ScatterPlot();
      const circles = el.querySelectorAll("circle");
      expect(circles).toHaveLength(3);
    });
    it("data-testid が ScatterPlotIcon", () => {
      const { el } = ScatterPlot();
      expect(el.getAttribute("data-testid")).toBe("ScatterPlotIcon");
    });
  });

  describe("mixed-element icon (SmartToy)", () => {
    it("path と circle を含む", () => {
      const { el } = SmartToy();
      expect(el.querySelectorAll("path").length).toBeGreaterThanOrEqual(1);
      expect(el.querySelectorAll("circle").length).toBe(2);
    });
  });

  describe("SVG 基本属性", () => {
    it("fill=currentColor / focusable=false / aria-hidden=true が設定される", () => {
      const { el } = ArrowDownward();
      expect(el.getAttribute("fill")).toBe("currentColor");
      expect(el.getAttribute("focusable")).toBe("false");
      expect(el.getAttribute("aria-hidden")).toBe("true");
    });
    it("width=1em / height=1em が設定される", () => {
      const { el } = ArrowDownward();
      expect(el.getAttribute("width")).toBe("1em");
      expect(el.getAttribute("height")).toBe("1em");
    });
    it("viewBox が 0 0 24 24", () => {
      const { el } = ArrowDownward();
      expect(el.getAttribute("viewBox")).toBe("0 0 24 24");
    });
  });

  describe("className / style オプション", () => {
    it("className が class 属性に設定される", () => {
      const { el } = Close({ className: "my-icon" });
      expect(el.getAttribute("class")).toBe("my-icon");
    });
    it("style オプションが svg.style に適用される", () => {
      const { el } = Close({ style: { display: "block" } });
      expect(el.style.display).toBe("block");
    });
  });

  describe("iconName プロパティ", () => {
    it("ArrowDownward.iconName が ArrowDownward", () => {
      expect(ArrowDownward.iconName).toBe("ArrowDownward");
    });
    it("TrendingUp.iconName が TrendingUp", () => {
      expect(TrendingUp.iconName).toBe("TrendingUp");
    });
  });
});
