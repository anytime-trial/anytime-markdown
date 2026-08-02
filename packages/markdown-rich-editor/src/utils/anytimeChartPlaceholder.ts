/**
 * anytime-chart フェンスが「プレースホルダ（本文未記述）」かを判定する。
 *
 * スラッシュ挿入直後はコメント行のみのスケルトンが入る。これは JSON パースエラーになるが、
 * エラー表示ではなく「編集画面を開いて JSON を記述してください」という友好的ヒントを
 * 出したい。判定基準: コメント行（`#` 始まり）と空行を除いて本文が空なら placeholder。
 * 本文がある（が JSON 不正等）の場合は false を返し、従来どおりエラー表示に委ねる。
 */
export function isAnytimeChartPlaceholder(code: string): boolean {
  const meaningful = code
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  return meaningful.length === 0;
}

/** インラインプレビュー用のヒント文言（PreviewRenderContext は t を持たないため静的）。 */
export const ANYTIME_CHART_PLACEHOLDER_HINT_JA =
  "チャート — 編集画面を開き、JSON を記述してください。";

/** ヒントを示す <pre> 要素を生成する（インライン用）。 */
export function createAnytimeChartHintElement(message: string): HTMLElement {
  const pre = document.createElement("pre");
  pre.className = "anytime-chart-hint";
  pre.style.cssText =
    "margin:8px;padding:8px 12px;white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-size:0.8125rem;";
  pre.textContent = message;
  return pre;
}
