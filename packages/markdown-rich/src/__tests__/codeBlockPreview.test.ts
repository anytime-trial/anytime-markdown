/**
 * codeBlockPreview.ts — native codeblock NodeView の language 別プレビュー
 * オーケストレータのテスト。描画 seam（mermaid/katex/plantuml）はモックする。
 */

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
import { renderKatexHtml } from "../hooks/useKatexRender";
import { getCachedMermaidSvg, requestMermaidRender } from "../hooks/useMermaidRender";
import { buildPlantUmlImageUrl, getPlantUmlConsent } from "../hooks/usePlantUmlRender";

const ctx = { isDark: false, fontSize: 16, t: (k: string) => k };
const flush = () => new Promise((r) => setTimeout(r, 0));

function inner(): HTMLElement {
  return document.createElement("div");
}

describe("renderCodeBlockPreview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("空コードは inner をクリアする", () => {
    const el = inner();
    el.innerHTML = "stale";
    renderCodeBlockPreview(el, "mermaid", "   ", ctx, () => {});
    expect(el.childNodes.length).toBe(0);
  });

  it("html は sanitize して innerHTML へ反映する", () => {
    const el = inner();
    renderCodeBlockPreview(el, "html", "<b>x</b><script>bad()</script>", ctx, () => {});
    expect(el.innerHTML).toContain("<b>x</b>");
    expect(el.innerHTML).not.toContain("<script>");
  });

  it("markdown はレンダリング済み HTML を反映する", () => {
    const el = inner();
    renderCodeBlockPreview(el, "markdown", "# 見出し\n\n- 項目", ctx, () => {});
    expect(el.innerHTML).toContain("<h1>見出し</h1>");
    expect(el.innerHTML).toContain("<li>項目</li>");
    expect(el.getAttribute("aria-label")).toBe("Markdown preview");
    expect(el.classList.contains("rich-codeblock-markdown-preview")).toBe(true);
  });

  it("markdown から他言語へ切替えるとスタイルフックのクラスを外す", () => {
    const el = inner();
    renderCodeBlockPreview(el, "markdown", "# x", ctx, () => {});
    renderCodeBlockPreview(el, "html", "<b>x</b>", ctx, () => {});
    expect(el.classList.contains("rich-codeblock-markdown-preview")).toBe(false);
  });

  // 図（role="img"）から構造化コンテンツへ切替えたとき role が残ると、スクリーンリーダーが
  // 見出し・表を単一の画像として読み上げてしまう。
  it("図から markdown へ切替えると role=img を外す", () => {
    const el = inner();
    renderCodeBlockPreview(el, "mermaid", "graph TD; A-->B", ctx, () => {});
    expect(el.getAttribute("role")).toBe("img");
    renderCodeBlockPreview(el, "markdown", "# 見出し", ctx, () => {});
    expect(el.getAttribute("role")).toBeNull();
  });

  it("図から html へ切替えると role=img を外す", () => {
    const el = inner();
    renderCodeBlockPreview(el, "mermaid", "graph TD; A-->B", ctx, () => {});
    renderCodeBlockPreview(el, "html", "<b>x</b>", ctx, () => {});
    expect(el.getAttribute("role")).toBeNull();
  });

  it("図からプレビュー非対象の言語へ切替えると role と aria-label を外す", () => {
    const el = inner();
    renderCodeBlockPreview(el, "mermaid", "graph TD; A-->B", ctx, () => {});
    renderCodeBlockPreview(el, "typescript", "const x = 1", ctx, () => {});
    expect(el.getAttribute("role")).toBeNull();
    expect(el.getAttribute("aria-label")).toBeNull();
  });

  it("math は renderKatexHtml の結果を反映する", async () => {
    (renderKatexHtml as jest.Mock).mockResolvedValue({ html: "<span>M</span>", error: "" });
    const el = inner();
    renderCodeBlockPreview(el, "math", "x^2", ctx, () => {});
    await flush();
    expect(el.innerHTML).toContain("M");
  });

  it("math エラーは textContent に表示する", async () => {
    (renderKatexHtml as jest.Mock).mockResolvedValue({ html: "", error: "KaTeX: bad" });
    const el = inner();
    renderCodeBlockPreview(el, "math", "x^", ctx, () => {});
    await flush();
    expect(el.textContent).toBe("KaTeX: bad");
  });

  it("math のキャンセル関数で結果反映を抑止する", async () => {
    let resolveFn: (v: { html: string; error: string }) => void = () => {};
    (renderKatexHtml as jest.Mock).mockReturnValue(new Promise((r) => { resolveFn = r; }));
    const el = inner();
    const cancel = renderCodeBlockPreview(el, "math", "x", ctx, () => {});
    cancel();
    resolveFn({ html: "<span>late</span>", error: "" });
    await flush();
    expect(el.innerHTML).not.toContain("late");
  });

  it("mermaid はキャッシュ初期値＋requestMermaidRender の結果を反映する", () => {
    (getCachedMermaidSvg as jest.Mock).mockReturnValue('<svg viewBox="0 0 100 100" width="100%">cached</svg>');
    (requestMermaidRender as jest.Mock).mockImplementation((_c, _d, cb) => {
      cb('<svg viewBox="0 0 200 100" width="100%">fresh</svg>', "");
      return () => {};
    });
    const el = inner();
    renderCodeBlockPreview(el, "mermaid", "graph TD; A-->B", ctx, () => {});
    expect(el.innerHTML).toContain("fresh");
    expect(requestMermaidRender).toHaveBeenCalled();
  });

  it("mermaid エラーは textContent に表示する", () => {
    (requestMermaidRender as jest.Mock).mockImplementation((_c, _d, cb) => { cb("", "Mermaid: syntax"); return () => {}; });
    const el = inner();
    renderCodeBlockPreview(el, "mermaid", "bad", ctx, () => {});
    expect(el.textContent).toBe("Mermaid: syntax");
  });

  it("plantuml accepted は img を描画する", () => {
    (getPlantUmlConsent as jest.Mock).mockReturnValue("accepted");
    const el = inner();
    renderCodeBlockPreview(el, "plantuml", "@startuml\nA->B\n@enduml", ctx, () => {});
    const img = el.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://plantuml.example/svg/X");
    expect(buildPlantUmlImageUrl).toHaveBeenCalled();
  });

  it("plantuml pending は同意 UI を描画し、accept で requestRerender を呼ぶ", () => {
    (getPlantUmlConsent as jest.Mock).mockReturnValue("pending");
    const el = inner();
    const rerender = jest.fn();
    renderCodeBlockPreview(el, "plantuml", "@startuml\nA->B\n@enduml", ctx, rerender);
    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    const buttons = el.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    (buttons[1] as HTMLButtonElement).click(); // accept
    expect(rerender).toHaveBeenCalled();
    expect(sessionStorage.getItem("plantuml-external-consent")).toBe("accepted");
  });

  it("regular は inner をクリアする", () => {
    const el = inner();
    el.innerHTML = "old";
    renderCodeBlockPreview(el, "typescript", "const x = 1", ctx, () => {});
    expect(el.childNodes.length).toBe(0);
  });

  it("anytime-thinking-model は SVG を描画し role=img を付ける", () => {
    const el = inner();
    renderCodeBlockPreview(el, "anytime-thinking-model", "type: pyramid\n- 理念\n- 戦略", ctx, () => {});
    expect(el.getAttribute("role")).toBe("img");
    expect(el.querySelector("svg")).not.toBeNull();
    expect(el.innerHTML).toContain("理念");
  });

  it("anytime-thinking-model の不正 DSL はエラーメッセージを表示する（silent でない）", () => {
    const el = inner();
    renderCodeBlockPreview(el, "anytime-thinking-model", "type: fishbone", ctx, () => {});
    const pre = el.querySelector("pre.anytime-graph-error");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain("anytime-graph");
    expect(el.querySelector("svg")).toBeNull();
  });
});
