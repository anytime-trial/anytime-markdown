/**
 * anytime-graph フェンスが「型未指定スケルトン（プレースホルダ）」かを判定する。
 *
 * スラッシュ挿入直後は `# ...` コメントのみのスケルトンが入る。これは GraphDslError に
 * なるが、エラー表示ではなく「サンプルから図種を選んでください」という友好的ヒントを
 * 出したい。判定基準: コメント行（`#` 始まり）と空行を除いて本文が空なら placeholder。
 * 本文がある（が type 無し等で不正）の場合は false を返し、従来どおりエラー表示に委ねる。
 */
export function isAnytimeGraphPlaceholder(code: string): boolean {
  const meaningful = code
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  return meaningful.length === 0;
}

/** インラインプレビュー用のヒント文言（PreviewRenderContext は t を持たないため静的）。 */
export const ANYTIME_GRAPH_PLACEHOLDER_HINT_JA =
  "思考法ダイアグラム — 編集画面を開き、サンプルから図種を選択してください。";

/** ヒントを示す <pre> 要素を生成する（インライン用）。 */
export function createAnytimeGraphHintElement(message: string): HTMLElement {
  const pre = document.createElement("pre");
  pre.className = "anytime-graph-hint";
  pre.style.cssText =
    "margin:8px;padding:8px 12px;white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-size:0.8125rem;";
  pre.textContent = message;
  return pre;
}

/** ヒントを示す HTML 文字列を生成する（編集ダイアログ用）。message は呼び出し側でエスケープ済みのこと。 */
export function anytimeGraphHintHtml(messageEscaped: string): string {
  return `<pre class="anytime-graph-hint" style="white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-family:inherit;">${messageEscaped}</pre>`;
}
