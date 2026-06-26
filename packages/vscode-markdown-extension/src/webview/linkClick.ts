/**
 * webview のリンククリック判定（純粋ロジック）。
 *
 * 背景: `<a href="/README.ja.md">` のような内部リンクをクリックすると、デフォルト遷移で
 * webview のオリジン（`...vscode-resource.vscode-cdn.net`）基準に解決され、ブラウザが
 * その URL を開いてしまう。これを防ぐため、内部リンク（ファイルを指す相対/ルート相対）の
 * クリックは webview 側で横取りし、extension host にファイルを開かせる。
 *
 * app.ts は副作用（DOM/イベント）ゆえテスト困難なため、判定だけを純粋関数として切り出す。
 */

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
  // プロトコル相対 URL（`//example.com`）は外部として扱う。
  if (href.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  return true;
}
