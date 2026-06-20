/**
 * anytime-chart プレビューの共通マウント処理。
 * インラインプレビュー（codeBlockPreview）と編集ダイアログ右ペイン（onPreviewRendered）の
 * 双方から使う。`<anytime-chart>` は `.spec` プロパティ駆動の canvas WC のため、HTML 文字列では
 * 描画できず、要素を実体マウントして spec を設定する必要がある。
 */

import "@anytime-markdown/chart-core/element"; // customElements.define の副作用
import type { ChartSpec } from "@anytime-markdown/chart-core";

import {
  ANYTIME_CHART_PLACEHOLDER_HINT_JA,
  createAnytimeChartHintElement,
  isAnytimeChartPlaceholder,
} from "./anytimeChartPlaceholder";

/**
 * code（JSON 形式の ChartSpec）を container 内に `<anytime-chart>` として描画する。
 * - プレースホルダ（本文未記述）はヒントを表示
 * - 不正 JSON は原因メッセージを表示（silent catch 禁止）
 * 戻り値は cleanup 関数（再描画・破棄時に呼ぶ）。
 */
export function mountAnytimeChartPreview(
  container: HTMLElement,
  code: string,
  isDark: boolean,
): () => void {
  if (isAnytimeChartPlaceholder(code)) {
    container.replaceChildren(createAnytimeChartHintElement(ANYTIME_CHART_PLACEHOLDER_HINT_JA));
    return () => {};
  }

  let parsed: ChartSpec;
  try {
    parsed = JSON.parse(code) as ChartSpec;
  } catch (err) {
    const pre = document.createElement("pre");
    pre.className = "anytime-chart-error";
    pre.style.cssText =
      "margin:8px;padding:8px 12px;white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-size:0.8125rem;";
    pre.textContent = `anytime-chart: JSON パースエラー (${err instanceof Error ? err.message : String(err)})`;
    container.replaceChildren(pre);
    return () => {};
  }

  const el = document.createElement("anytime-chart");
  el.style.cssText = "display:block;width:100%;height:320px";
  el.setAttribute("theme", isDark ? "dark" : "light");
  (el as unknown as { spec: ChartSpec }).spec = parsed;
  container.replaceChildren(el);

  return () => {
    container.replaceChildren();
  };
}
