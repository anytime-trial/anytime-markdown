/**
 * webview のリンククリック判定（純粋ロジック）。
 *
 * 背景: `<a href="/README.ja.md">` のような内部リンクを素クリックすると、デフォルト遷移で
 * webview のオリジン（`...vscode-resource.vscode-cdn.net`）基準に解決され、ブラウザが
 * その URL を開いてしまう。これを防ぐため、内部（非 http(s)・非 `#`）リンクは常に
 * デフォルト遷移を抑止する。追従して extension host で開くのは Ctrl/Cmd+クリックまたは
 * ダブルクリックのみ（VS Code 流儀。素クリックはエディタ内のカーソル配置に委ねる）。
 *
 * app.ts は副作用（DOM/イベント）ゆえテスト困難なため、判定だけを純粋関数として切り出す。
 */
export interface LinkClickInput {
  /** アンカーの `href` 属性値（無い場合 null）。 */
  href: string | null;
  /** Ctrl または Meta(Cmd) が押されているか。 */
  ctrlOrMeta: boolean;
  /** ダブルクリックか。 */
  dblClick: boolean;
}

export interface LinkClickAction {
  /** デフォルトのブラウザ遷移を抑止すべきか。 */
  preventDefault: boolean;
  /** extension host へ `openLink` を送って開くべきか。 */
  open: boolean;
}

/**
 * ファイルを指す内部リンクか。
 *
 * - ページ内アンカー(`#...`)は除外（ブラウザのページ内スクロールに委ねる）。
 * - スキーム付き(`http:` / `https:` / `mailto:` / `vscode:` / `tel:` 等)は外部として除外し、
 *   ブラウザ・VS Code のデフォルト処理に委ねる（素クリックを無音で無効化しない）。
 * - スキーム無し（`./x.md` / `/x.md` / `notes/x.md` 等）をファイルリンクとみなす。
 */
export function isInternalLink(href: string | null): href is string {
  if (!href) return false;
  if (href.startsWith('#')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  return true;
}

export function resolveLinkClickAction(input: LinkClickInput): LinkClickAction {
  if (!isInternalLink(input.href)) {
    return { preventDefault: false, open: false };
  }
  return { preventDefault: true, open: input.ctrlOrMeta || input.dblClick };
}
