/**
 * anytime-graph（思考法ダイアグラム）が生成する SVG 専用の DOMPurify 設定。
 *
 * Mermaid 向けの `SVG_SANITIZE_CONFIG` は `foreignObject`（HTML 埋め込み）を許可するが、
 * graph-core の `exportToSvg` は foreignObject を生成しないため、ここでは許可せず
 * XSS の攻撃面を最小化する。許可属性は exportSvg が出力する presentation 属性に限定する。
 */
export const GRAPH_SVG_SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_ATTR: ["xmlns", "style", "class", "viewBox", "font-family", "paint-order", "stroke-width"] as string[],
  FORBID_TAGS: ["script", "iframe", "object", "embed", "foreignObject"] as string[],
};
