/**
 * annotationSvg.ts — vanilla SVG アノテーション描画ビルダーのテスト。
 */
import { buildAnnotationSvg } from "../utils/annotationSvg";
import type { ImageAnnotation } from "../types/imageAnnotation";

function ann(partial: Partial<ImageAnnotation>): ImageAnnotation {
  return {
    id: "a1",
    type: "rect",
    x1: 10,
    y1: 20,
    x2: 50,
    y2: 60,
    color: "#ef4444",
    ...partial,
  };
}

describe("buildAnnotationSvg", () => {
  it("returns null for an empty annotation list", () => {
    expect(buildAnnotationSvg([])).toBeNull();
  });

  it("renders a rect annotation with a numbered badge", () => {
    const svg = buildAnnotationSvg([ann({ type: "rect" })])!;
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.querySelector("rect")).not.toBeNull();
    expect(svg.querySelector("text")?.textContent).toBe("1");
    // badge 円 + shape は同一 group 配下
    expect(svg.querySelectorAll("g").length).toBe(1);
  });

  it("renders circle as ellipse and line as line", () => {
    const svg = buildAnnotationSvg([
      ann({ id: "c", type: "circle" }),
      ann({ id: "l", type: "line" }),
    ])!;
    expect(svg.querySelector("ellipse")).not.toBeNull();
    expect(svg.querySelector("line")).not.toBeNull();
    // 2 アノテーション → badge text は "1","2"
    const texts = [...svg.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toEqual(["1", "2"]);
  });
});
