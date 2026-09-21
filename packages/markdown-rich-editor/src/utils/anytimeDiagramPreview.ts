/**
 * anytime-diagram プレビューの共通マウント処理。
 * インラインプレビュー（codeBlockPreview）と編集ダイアログの双方から使う。
 * 本文は `*.diagram.json` と同じ `DiagramDocument` の JSON 全文。
 */

import { validateDiagramDocument } from "@anytime-markdown/diagram-core";
import { mountDiagramViewer } from "@anytime-markdown/diagram-viewer";

/**
 * 描画に失敗した理由を本文の代わりに出す（silent catch 禁止）。
 *
 * class を `anytime-diagram-fence-error` にしているのは、ビューア内部の知らせが
 * `anytime-diagram-error` を使っており（`diagram-viewer` の `diagramStyles`）、同名だと
 * 「フェンスが読めない」と「図の中の知らせ」を検査でも CSS でも区別できないため。
 */
function showError(container: HTMLElement, message: string): () => void {
  const pre = document.createElement("pre");
  pre.className = "anytime-diagram-fence-error";
  pre.style.cssText =
    "margin:8px;padding:8px 12px;white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-size:0.8125rem;";
  pre.textContent = `anytime-diagram: ${message}`;
  container.replaceChildren(pre);
  return () => { container.replaceChildren(); };
}

/**
 * code（JSON 形式の DiagramDocument）を container 内へ閲覧専用の系図として描画する。
 * 戻り値は cleanup 関数（再描画・破棄時に呼ぶ）。
 */
export function mountAnytimeDiagramPreview(
  container: HTMLElement,
  code: string,
  ctx: { isDark: boolean; locale?: string },
): () => void {
  if (!code.trim()) {
    container.replaceChildren();
    return () => {};
  }

  let value: unknown;
  try {
    value = JSON.parse(code);
  } catch (err) {
    return showError(container, `JSON パースエラー (${err instanceof Error ? err.message : String(err)})`);
  }

  // 保存の入口と同じ検査を通す（配置差分まで検証済みの図を受け取る）。
  const validated = validateDiagramDocument(value);
  if (!validated.ok) return showError(container, validated.errors.join("\n"));

  const el = document.createElement("div");
  el.style.cssText = "display:block;width:100%;height:360px";
  el.style.colorScheme = ctx.isDark ? "dark" : "light";
  container.replaceChildren(el);
  const handle = mountDiagramViewer(el, {
    document: validated.document,
    editable: false,
    ...(ctx.locale === undefined ? {} : { locale: ctx.locale }),
  });
  return () => {
    handle.destroy();
    container.replaceChildren();
  };
}
