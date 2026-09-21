/**
 * renderAnytimeDiagram — anytime-diagram フェンス（系図）のインラインプレビュー描画テスト。
 * jsdom には Canvas context も ResizeObserver もないためモックする。
 */

// jsdom に無い API（Canvas context・ResizeObserver）を chart のテストと同方式でモックする。
beforeAll(() => {
  const noop = () => {};
  const ctxStub = new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === "measureText") return () => ({ width: 10 });
        if (p === "canvas") return { width: 400, height: 300 };
        return noop;
      },
      set: () => true,
    },
  );
  // @ts-expect-error テスト用モック
  HTMLCanvasElement.prototype.getContext = () => ctxStub;
  // @ts-expect-error テスト用モック
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

// 依存モックはテスト対象のモジュールより先に宣言する
jest.mock("../hooks/useKatexRender", () => ({
  MATH_SANITIZE_CONFIG: { ALLOWED_TAGS: ["span"], ALLOWED_ATTR: [] },
  renderKatexHtml: jest.fn(),
}));
jest.mock("../hooks/useMermaidRender", () => ({
  getCachedMermaidSvg: jest.fn(() => ""),
  requestMermaidRender: jest.fn(),
  detectMermaidType: jest.fn(() => "diagramGeneric"),
  SVG_SANITIZE_CONFIG: { USE_PROFILES: { svg: true, svgFilters: true, html: true } },
}));
jest.mock("../hooks/usePlantUmlRender", () => ({
  buildPlantUmlImageUrl: jest.fn(() => "https://plantuml.example/svg/X"),
  getPlantUmlConsent: jest.fn(() => "accepted"),
}));
jest.mock("@anytime-markdown/markdown-editor", () => ({
  PLANTUML_CONSENT_KEY: "plantuml-external-consent",
}));

import { renderCodeBlockPreview } from "../components/codeblock/codeBlockPreview";

import { createEmptyDiagramDocument } from "@anytime-markdown/diagram-core";
import { mountAnytimeDiagramPreview } from "../utils/anytimeDiagramPreview";
import { extractDiagramAltText } from "../utils/diagramAltText";

const ctx = { isDark: false, fontSize: 16 };
const validJson = JSON.stringify(createEmptyDiagramDocument("テスト系図"));

describe("renderCodeBlockPreview / anytime-diagram", () => {
  it("正常な JSON で閲覧専用の系図を描画し、cleanup で空になる", () => {
    const el = document.createElement("div");
    const cleanup = renderCodeBlockPreview(el, "anytime-diagram", validJson, ctx, () => {});
    expect(el.querySelector(".anytime-diagram")).not.toBeNull();
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-label")).toContain("テスト系図");
    expect((el.firstElementChild as HTMLElement).style.height).toBe("360px");
    cleanup();
    expect(el.childNodes).toHaveLength(0);
  });

  it("壊れた JSON の原因を表示する", () => {
    const el = document.createElement("div");
    const cleanup = mountAnytimeDiagramPreview(el, "{ invalid json }", ctx);
    expect(el.querySelector(".anytime-diagram-fence-error")?.textContent).toMatch(/JSON パースエラー.+/);
    expect(el.querySelector(".anytime-diagram")).toBeNull();
    cleanup();
    expect(el.childNodes).toHaveLength(0);
  });

  it("検証失敗の原因を表示する", () => {
    const el = document.createElement("div");
    mountAnytimeDiagramPreview(el, '{"version":2}', ctx);
    expect(el.querySelector(".anytime-diagram-fence-error")?.textContent).toContain("version=1");
  });

  it("空白だけの本文には描画しない", () => {
    const el = document.createElement("div");
    mountAnytimeDiagramPreview(el, "  ", ctx)();
    expect(el.childNodes).toHaveLength(0);
  });

  it("人物名を重複排除し、入力長と表示件数を制限する", () => {
    const code = JSON.stringify({ title: "家族", nodes: ["A"], families: [
      { parents: ["A", "B"], children: ["C", "D", "E", "F"] },
    ] });
    expect(extractDiagramAltText(code, "anytime-diagram")).toBe("家族 (6 elements): A, B, C, D, E ...and 1 more");
    expect(extractDiagramAltText("{bad", "anytime-diagram")).toBe("Diagram");
    // 長い題名は切り詰めて載せる（入力を切り詰めないので JSON は壊れない）。
    const longTitle = extractDiagramAltText(JSON.stringify({ title: "x".repeat(501) }), "anytime-diagram");
    expect(longTitle).toBe(`${"x".repeat(60)}... (0 elements)`);
  });
});
