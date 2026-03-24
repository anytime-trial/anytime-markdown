/**
 * useMermaidRender.ts のテスト
 * SVG_SANITIZE_CONFIG 定数と detectMermaidType 関数をテスト
 */
import { SVG_SANITIZE_CONFIG, detectMermaidType } from "../hooks/useMermaidRender";

describe("SVG_SANITIZE_CONFIG", () => {
  it("has expected USE_PROFILES", () => {
    expect(SVG_SANITIZE_CONFIG.USE_PROFILES).toEqual({
      svg: true,
      svgFilters: true,
      html: true,
    });
  });

  it("allows foreignObject tag", () => {
    expect(SVG_SANITIZE_CONFIG.ADD_TAGS).toContain("foreignObject");
  });

  it("forbids script tag", () => {
    expect(SVG_SANITIZE_CONFIG.FORBID_TAGS).toContain("script");
  });

  it("forbids iframe tag", () => {
    expect(SVG_SANITIZE_CONFIG.FORBID_TAGS).toContain("iframe");
  });

  it("forbids object and embed tags", () => {
    expect(SVG_SANITIZE_CONFIG.FORBID_TAGS).toContain("object");
    expect(SVG_SANITIZE_CONFIG.FORBID_TAGS).toContain("embed");
  });

  it("allows xmlns and style attributes", () => {
    expect(SVG_SANITIZE_CONFIG.ADD_ATTR).toContain("xmlns");
    expect(SVG_SANITIZE_CONFIG.ADD_ATTR).toContain("style");
    expect(SVG_SANITIZE_CONFIG.ADD_ATTR).toContain("class");
  });
});

describe("detectMermaidType", () => {
  it("detects flowchart from 'graph' keyword", () => {
    expect(detectMermaidType("graph TD\n  A-->B")).toBe("diagramFlowchart");
  });

  it("detects flowchart from 'flowchart' keyword", () => {
    expect(detectMermaidType("flowchart LR\n  A-->B")).toBe("diagramFlowchart");
  });

  it("detects sequence diagram", () => {
    expect(detectMermaidType("sequenceDiagram\n  A->>B: msg")).toBe("diagramSequence");
  });

  it("detects class diagram", () => {
    expect(detectMermaidType("classDiagram\n  Class01")).toBe("diagramClass");
  });

  it("detects state diagram", () => {
    expect(detectMermaidType("stateDiagram\n  [*] --> S1")).toBe("diagramState");
  });

  it("detects state diagram v2", () => {
    expect(detectMermaidType("stateDiagram-v2\n  [*] --> S1")).toBe("diagramState");
  });

  it("detects ER diagram", () => {
    expect(detectMermaidType("erDiagram\n  CUSTOMER")).toBe("diagramEr");
  });

  it("detects gantt chart", () => {
    expect(detectMermaidType("gantt\n  title A Gantt")).toBe("diagramGantt");
  });

  it("detects pie chart", () => {
    expect(detectMermaidType("pie\n  title Pets")).toBe("diagramPie");
  });

  it("detects mindmap", () => {
    expect(detectMermaidType("mindmap\n  root")).toBe("diagramMindmap");
  });

  it("returns generic for unknown type", () => {
    expect(detectMermaidType("unknown\n  content")).toBe("diagramGeneric");
  });

  it("handles leading whitespace", () => {
    expect(detectMermaidType("  graph TD\n  A-->B")).toBe("diagramFlowchart");
  });

  it("handles empty string", () => {
    expect(detectMermaidType("")).toBe("diagramGeneric");
  });
});
