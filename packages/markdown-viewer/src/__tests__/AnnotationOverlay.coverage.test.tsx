/**
 * AnnotationOverlay.tsx - カバレッジテスト
 * renderAnnotation: rect, circle, line types + empty annotations
 */
import React from "react";
import { render } from "@testing-library/react";
import { AnnotationOverlay } from "../components/AnnotationOverlay";
import type { ImageAnnotation } from "../types/imageAnnotation";

describe("AnnotationOverlay coverage", () => {
  it("returns null for empty annotations", () => {
    const { container } = render(<AnnotationOverlay annotations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders rect annotation", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 10, y1: 20, x2: 50, y2: 60, color: "red" },
    ];
    const { container } = render(<AnnotationOverlay annotations={annotations} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    const rect = svg!.querySelector("rect");
    expect(rect).toBeTruthy();
    expect(rect!.getAttribute("x")).toBe("10");
    expect(rect!.getAttribute("y")).toBe("20");
    expect(rect!.getAttribute("width")).toBe("40");
    expect(rect!.getAttribute("height")).toBe("40");
    expect(rect!.getAttribute("stroke")).toBe("red");
  });

  it("renders circle annotation", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a2", type: "circle", x1: 10, y1: 20, x2: 50, y2: 60, color: "blue" },
    ];
    const { container } = render(<AnnotationOverlay annotations={annotations} />);
    const ellipse = container.querySelector("ellipse");
    expect(ellipse).toBeTruthy();
    expect(ellipse!.getAttribute("cx")).toBe("30");
    expect(ellipse!.getAttribute("cy")).toBe("40");
    expect(ellipse!.getAttribute("rx")).toBe("20");
    expect(ellipse!.getAttribute("ry")).toBe("20");
    expect(ellipse!.getAttribute("stroke")).toBe("blue");
  });

  it("renders line annotation", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a3", type: "line", x1: 5, y1: 10, x2: 80, y2: 90, color: "green" },
    ];
    const { container } = render(<AnnotationOverlay annotations={annotations} />);
    const line = container.querySelector("line");
    expect(line).toBeTruthy();
    expect(line!.getAttribute("x1")).toBe("5");
    expect(line!.getAttribute("y1")).toBe("10");
    expect(line!.getAttribute("x2")).toBe("80");
    expect(line!.getAttribute("y2")).toBe("90");
    expect(line!.getAttribute("stroke")).toBe("green");
  });

  it("renders badge circle and text for each annotation", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 10, y1: 20, x2: 50, y2: 60, color: "red" },
      { id: "a2", type: "line", x1: 5, y1: 10, x2: 80, y2: 90, color: "blue" },
    ];
    const { container } = render(<AnnotationOverlay annotations={annotations} />);
    const texts = container.querySelectorAll("text");
    expect(texts).toHaveLength(2);
    expect(texts[0].textContent).toBe("1");
    expect(texts[1].textContent).toBe("2");
  });

  it("renders with custom style", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "red" },
    ];
    const { container } = render(
      <AnnotationOverlay annotations={annotations} style={{ opacity: 0.5 }} />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("handles annotation with reversed coordinates (x2 < x1)", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 60, y1: 70, x2: 20, y2: 30, color: "red" },
    ];
    const { container } = render(<AnnotationOverlay annotations={annotations} />);
    const rect = container.querySelector("rect");
    expect(rect).toBeTruthy();
    // Math.min should produce correct x, y
    expect(rect!.getAttribute("x")).toBe("20");
    expect(rect!.getAttribute("y")).toBe("30");
    expect(rect!.getAttribute("width")).toBe("40");
    expect(rect!.getAttribute("height")).toBe("40");
  });
});
