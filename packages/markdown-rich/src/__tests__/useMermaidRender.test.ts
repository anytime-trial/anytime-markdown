/**
 * useMermaidRender.ts のテスト
 * SVG_SANITIZE_CONFIG 定数と detectMermaidType 関数をテスト
 */
import DOMPurify from "dompurify";

import { SVG_SANITIZE_CONFIG, detectMermaidType } from "../hooks/useMermaidRender";

/** mermaid v11 が flowchart ノードラベルに出力する foreignObject 構造 */
const MERMAID_NODE_LABEL_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg">',
  '<g class="node"><rect width="100" height="40"></rect>',
  '<g class="label"><foreignObject width="80" height="24">',
  '<div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-block">',
  '<span class="nodeLabel"><p>ラベルA</p></span>',
  "</div></foreignObject></g></g></svg>",
].join("");

// DOMPurify.sanitize は渡した cfg の ADD_TAGS を in-place で小文字化するため clone して渡す
function cloneConfig() {
  return JSON.parse(JSON.stringify(SVG_SANITIZE_CONFIG)) as typeof SVG_SANITIZE_CONFIG;
}

describe("SVG_SANITIZE_CONFIG sanitize 結果", () => {
  it("foreignObject 内の HTML ラベルを保持する", () => {
    const sanitized = DOMPurify.sanitize(MERMAID_NODE_LABEL_SVG, cloneConfig());

    expect(sanitized).toContain("ラベルA");
    expect(sanitized).toContain('class="nodeLabel"');
  });

  it("foreignObject 内のスクリプト・イベントハンドラ・javascript: URL を除去する", () => {
    const xss = [
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject>',
      '<div xmlns="http://www.w3.org/1999/xhtml">',
      "<script>alert(1)</script>",
      '<img src="x" onerror="alert(1)">',
      '<p onclick="steal()">ok</p>',
      '<a href="javascript:alert(1)">l</a>',
      '<iframe src="x"></iframe>',
      "</div></foreignObject></svg>",
    ].join("");

    const sanitized = DOMPurify.sanitize(xss, cloneConfig());

    expect(sanitized).toContain("ok");
    expect(sanitized).not.toContain("alert");
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("<iframe");
  });
});

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
