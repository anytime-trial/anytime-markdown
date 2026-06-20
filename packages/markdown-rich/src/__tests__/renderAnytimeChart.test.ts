/**
 * renderAnytimeChart — anytime-chart フェンスのインラインプレビュー描画テスト。
 * jsdom には Canvas context も ResizeObserver もないためモックする。
 */

// chart-core の AnytimeChartElement.test.ts と同方式でモックする。
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
jest.mock("@anytime-markdown/markdown-viewer", () => ({
  PLANTUML_CONSENT_KEY: "plantuml-external-consent",
}));

import { renderCodeBlockPreview } from "../components/codeblock/codeBlockPreview";
import type { ChartSpec } from "@anytime-markdown/chart-core";

const ctx = { isDark: false, fontSize: 16 };

const validSpec: ChartSpec = {
  kind: "line",
  title: "テスト売上",
  categories: ["Jan", "Feb"],
  series: [{ name: "売上", values: [100, 120] }],
};
const validJson = JSON.stringify(validSpec);

describe("renderCodeBlockPreview / anytime-chart", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常な JSON フェンスで anytime-chart 要素が描画される", () => {
    const innerEl = document.createElement("div");
    expect(() => {
      renderCodeBlockPreview(innerEl, "anytime-chart", validJson, ctx, () => {});
    }).not.toThrow();
    expect(innerEl.querySelector("anytime-chart")).not.toBeNull();
  });

  it("不正 JSON で .anytime-chart-error 要素が表示される（silent でない）", () => {
    const innerEl = document.createElement("div");
    renderCodeBlockPreview(innerEl, "anytime-chart", "{ invalid json }", ctx, () => {});
    const pre = innerEl.querySelector("pre.anytime-chart-error");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain("JSON パースエラー");
    expect(innerEl.querySelector("anytime-chart")).toBeNull();
  });

  it("placeholder（# コメントのみ）でヒント要素が表示される", () => {
    const innerEl = document.createElement("div");
    renderCodeBlockPreview(
      innerEl,
      "anytime-chart",
      "# チャートの説明\n# kind: line",
      ctx,
      () => {},
    );
    const hint = innerEl.querySelector("pre.anytime-chart-hint");
    expect(hint).not.toBeNull();
    expect(innerEl.querySelector("anytime-chart")).toBeNull();
  });
});
