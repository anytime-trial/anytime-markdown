import DOMPurify from "dompurify";

import { HTML_SANITIZE_CONFIG } from "./types";
import { MATH_SANITIZE_CONFIG, renderKatexHtml } from "../../hooks/useKatexRender";
import { getCachedMermaidSvg, requestMermaidRender } from "../../hooks/useMermaidRender";
import { renderThinkingDiagramSvg, GraphDslError } from "@anytime-markdown/graph-core";
import { GRAPH_SVG_SANITIZE_CONFIG } from "../../utils/graphSvgSanitize";
import {
  isAnytimeGraphPlaceholder,
  createAnytimeGraphHintElement,
  ANYTIME_GRAPH_PLACEHOLDER_HINT_JA,
} from "../../utils/anytimeGraphPlaceholder";
import { mountAnytimeChartPreview } from "../../utils/anytimeChartPreview";
import { ensureMarkdownPreviewStyle, renderMarkdownPreviewHtml } from "../../utils/markdownPreview";
import { buildPlantUmlImageUrl, getPlantUmlConsent } from "../../hooks/usePlantUmlRender";
import { PLANTUML_CONSENT_KEY } from "@anytime-markdown/markdown-viewer";
import { extractDiagramAltText } from "../../utils/diagramAltText";

/**
 * codeblock の content-only native NodeView（反転）が language 別プレビューを
 * 命令的に描画するためのオーケストレータ。React 非依存。
 *
 * mermaid / plantuml / katex / html はいずれも S1 で抽出した純関数 seam
 * （`requestMermaidRender` / `renderKatexHtml` / `buildPlantUmlImageUrl`）を用い、
 * 結果文字列を `innerEl.innerHTML` / `img.src` へ命令的に反映する。
 * plantuml の同意取得 UI は native ボタンで描画し、同意変更時に `requestRerender`
 * を呼んで再描画させる。
 */

interface PreviewRenderContext {
  isDark: boolean;
  /** SVG フォントスケール用のエディタフォントサイズ(px)。 */
  fontSize: number;
}

/** SVG width を editor フォントサイズに応じてスケールする（DiagramBlock から移植）。 */
function scaleSvgForFontSize(svg: string, fontSize: number): string {
  const viewBoxMatch = /viewBox="-?[\d.]+ -?[\d.]+ ([\d.]+) [\d.]+"/.exec(svg);
  if (!viewBoxMatch) return svg;
  const viewBoxWidth = Number.parseFloat(viewBoxMatch[1]);
  const targetWidth = (fontSize / 16) * viewBoxWidth;
  return svg
    .replace(/width="100%"/, `width="${targetWidth}"`)
    .replace(/max-width:\s*[\d.]+px/, "max-width: 100%");
}

function renderHtml(innerEl: HTMLElement, code: string): void {
  innerEl.innerHTML = DOMPurify.sanitize(code, HTML_SANITIZE_CONFIG);
}

function renderMath(innerEl: HTMLElement, code: string): () => void {
  let cancelled = false;
  void renderKatexHtml(code).then(({ html, error }) => {
    if (cancelled) return;
    if (error) {
      innerEl.textContent = error;
      return;
    }
    innerEl.innerHTML = DOMPurify.sanitize(html, MATH_SANITIZE_CONFIG);
  });
  return () => { cancelled = true; };
}

function renderMermaid(innerEl: HTMLElement, code: string, ctx: PreviewRenderContext): () => void {
  const apply = (svg: string): void => { innerEl.innerHTML = scaleSvgForFontSize(svg, ctx.fontSize); };
  const cached = getCachedMermaidSvg(code, ctx.isDark);
  if (cached) apply(cached);
  return requestMermaidRender(code, ctx.isDark, (svg, error) => {
    if (error) { innerEl.textContent = error; return; }
    apply(svg);
  });
}

/**
 * plantuml 同意ボタンを native 描画する。
 * native content は i18n context を読めないため、ラベルは英語固定
 * （GifBlockContent と同方針。UX downgrade はユーザー許容済）。
 */
function buildConsentAlert(requestRerender: () => void): HTMLElement {
  const alert = document.createElement("div");
  alert.setAttribute("role", "alert");
  alert.style.cssText =
    "margin:8px;padding:8px 12px;border-radius:4px;font-size:0.8125rem;" +
    "border:1px solid var(--am-color-divider);color:var(--am-color-text-secondary);";
  const msg = document.createElement("div");
  msg.textContent = "This diagram is rendered via an external PlantUML server. Allow loading?";
  alert.appendChild(msg);

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;margin-top:8px;";
  const mkBtn = (label: string, value: "accepted" | "rejected"): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "cursor:pointer;padding:2px 10px;border-radius:4px;border:1px solid var(--am-color-divider);background:transparent;color:inherit;";
    b.addEventListener("click", () => {
      try {
        sessionStorage.setItem(PLANTUML_CONSENT_KEY, value);
      } catch {
        // sessionStorage 不可（プライベートモード等）。同意は一時的に効かないが致命ではない。
      }
      requestRerender();
    });
    return b;
  };
  actions.append(mkBtn("Decline", "rejected"), mkBtn("Allow", "accepted"));
  alert.appendChild(actions);
  return alert;
}

function renderPlantUml(innerEl: HTMLElement, code: string, ctx: PreviewRenderContext, requestRerender: () => void): void {
  if (getPlantUmlConsent() !== "accepted") {
    innerEl.replaceChildren(buildConsentAlert(requestRerender));
    return;
  }
  try {
    const url = buildPlantUmlImageUrl(code, ctx.isDark);
    const img = document.createElement("img");
    img.src = url;
    img.alt = extractDiagramAltText(code, "plantuml");
    img.referrerPolicy = "no-referrer";
    img.style.cssText = "max-width:100%;height:auto;";
    innerEl.replaceChildren(img);
  } catch (err) {
    innerEl.textContent = `PlantUML: ${err instanceof Error ? err.message : "encode error"}`;
  }
}

/**
 * anytime-graph フェンス（思考法ダイアグラム）を SVG プレビューとして描画する。
 * graph-core の `renderThinkingDiagramSvg` で DSL → 透過 SVG を生成し、
 * 埋め込み向けにレスポンシブ化・サニタイズしてから挿入する。
 * 不正な DSL は黙殺せず、原因メッセージを表示する（silent catch 禁止）。
 */
function renderAnytimeGraph(innerEl: HTMLElement, code: string, ctx: PreviewRenderContext): void {
  // 型未指定スケルトンはエラーではなく友好的ヒントを表示する。
  if (isAnytimeGraphPlaceholder(code)) {
    innerEl.replaceChildren(createAnytimeGraphHintElement(ANYTIME_GRAPH_PLACEHOLDER_HINT_JA));
    return;
  }
  try {
    let svg = renderThinkingDiagramSvg(code, ctx.isDark);
    // 固定 width/height をレスポンシブ指定へ置換（viewBox は維持）
    svg = svg.replace(
      /(<svg\b[^>]*?)\swidth="[\d.]+"\sheight="[\d.]+"/,
      '$1 width="100%" style="max-width:100%;height:auto"',
    );
    const sanitized = DOMPurify.sanitize(svg, GRAPH_SVG_SANITIZE_CONFIG);
    innerEl.innerHTML = scaleSvgForFontSize(sanitized, ctx.fontSize);
  } catch (err) {
    const message =
      err instanceof GraphDslError
        ? err.message
        : `anytime-graph: 描画に失敗しました (${err instanceof Error ? err.message : String(err)})`;
    const pre = document.createElement("pre");
    pre.className = "anytime-graph-error";
    pre.style.cssText = "margin:8px;padding:8px 12px;white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-size:0.8125rem;";
    pre.textContent = message;
    innerEl.replaceChildren(pre);
  }
}


/**
 * previewEl 内の inner 要素を language 別プレビューで更新する。
 * 戻り値は非同期/購読のキャンセル関数（次回再描画・破棄時に呼ぶ）。
 */
export function renderCodeBlockPreview(
  innerEl: HTMLElement,
  language: string,
  code: string,
  ctx: PreviewRenderContext,
  requestRerender: () => void,
): () => void {
  // innerEl は言語切替をまたいで使い回される。前の言語が付けた a11y 属性・スタイルフックが
  // 残ると、図から切替えた markdown/html が role="img" のまま読み上げられる。毎回リセットし、
  // 各 case が必要なものだけ再設定する。
  innerEl.removeAttribute("role");
  innerEl.removeAttribute("aria-label");
  innerEl.classList.toggle("rich-codeblock-markdown-preview", language === "markdown");
  if (!code.trim()) {
    innerEl.replaceChildren();
    return () => {};
  }
  switch (language) {
    case "html":
      renderHtml(innerEl, code);
      innerEl.setAttribute("aria-label", "HTML preview");
      return () => {};
    case "markdown":
      ensureMarkdownPreviewStyle();
      innerEl.innerHTML = renderMarkdownPreviewHtml(code);
      innerEl.setAttribute("aria-label", "Markdown preview");
      return () => {};
    case "math":
      innerEl.setAttribute("aria-label", `Math: ${code}`);
      return renderMath(innerEl, code);
    case "mermaid":
      innerEl.setAttribute("role", "img");
      innerEl.setAttribute("aria-label", extractDiagramAltText(code, "mermaid"));
      return renderMermaid(innerEl, code, ctx);
    case "plantuml":
      innerEl.setAttribute("role", "img");
      renderPlantUml(innerEl, code, ctx, requestRerender);
      return () => {};
    case "anytime-thinking-model":
      innerEl.setAttribute("role", "img");
      innerEl.setAttribute("aria-label", extractDiagramAltText(code, "anytime-thinking-model"));
      renderAnytimeGraph(innerEl, code, ctx);
      return () => {};
    case "anytime-chart":
      innerEl.setAttribute("role", "img");
      innerEl.setAttribute("aria-label", extractDiagramAltText(code, "anytime-chart"));
      return mountAnytimeChartPreview(innerEl, code, ctx.isDark);
    default:
      innerEl.replaceChildren();
      return () => {};
  }
}
