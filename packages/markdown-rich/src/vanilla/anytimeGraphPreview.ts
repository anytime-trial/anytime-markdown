import { renderThinkingDiagramSvg, GraphDslError } from "@anytime-markdown/graph-core";
import { isAnytimeGraphPlaceholder } from "../utils/anytimeGraphPlaceholder";

/** ヒントを示す HTML 文字列を生成する。message は呼び出し前に esc 済みであること（内部利用専用）。 */
function anytimeGraphHintHtml(messageEscaped: string): string {
  return `<pre class="anytime-graph-hint" style="white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-family:inherit;">${messageEscaped}</pre>`;
}

/**
 * anytime-graph 編集ダイアログのプレビュー HTML を生成する。
 * 型未指定スケルトンなら友好的ヒント、有効 DSL なら SVG、本文ありの不正 DSL はエラーを返す。
 * `sanitize` は SVG 用の DOMPurify ラッパを呼び出し側で注入する（重い import を避けテスト容易化）。
 */
export function renderAnytimeGraphPreviewHtml(
  code: string,
  dark: boolean,
  hintMessage: string,
  sanitize: (svg: string) => string,
): string {
  const esc = (s: string) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  if (isAnytimeGraphPlaceholder(code)) {
    return anytimeGraphHintHtml(esc(hintMessage));
  }
  try {
    let svg = renderThinkingDiagramSvg(code, dark);
    svg = svg.replace(
      /(<svg\b[^>]*?)\swidth="[\d.]+"\sheight="[\d.]+"/,
      '$1 width="100%" style="max-width:100%;height:auto"',
    );
    return sanitize(svg);
  } catch (err) {
    const msg =
      err instanceof GraphDslError
        ? err.message
        : `anytime-graph: ${err instanceof Error ? err.message : String(err)}`;
    return `<pre class="anytime-graph-error" style="white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-family:monospace;">${esc(msg)}</pre>`;
  }
}
