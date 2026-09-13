/**
 * Markdown をサーバ側で HTML へ変換する（report 記事の SSR 本文用）。
 *
 * Why not クライアント任せ: 記事本文はクライアントの vanilla ビューアが描画していたため、
 * サーバが返す HTML には見出しも段落も 1 つも含まれていなかった（実測 183 文字）。
 * クローラが読むのは最初に返る HTML なので、記事 199 本が実質空ページとして扱われる。
 *
 * Why not DOMPurify: sanitize には DOM が要り、サーバ実行のために jsdom 系の依存を
 * 増やすことになる。ここは「生 HTML を一切通さない」構成にして、そもそもサニタイズ対象の
 * 木を作らない方向で閉じる（許可リストの列挙漏れという失敗様式ごと避ける）。
 */

import { Marked, type Tokens } from 'marked';

/** href / src に許可するスキーム。ここに無いスキームはリンク自体を落とす */
const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ブラウザの URL パーサが位置を問わず取り除く文字（tab / LF / CR）のコードポイント */
const URL_IGNORED_CHAR_CODES = new Set([0x09, 0x0a, 0x0d]);

/**
 * URL を検査し、許可できないものは null を返す。
 *
 * tab / LF / CR を落とすのは、`java<tab>script:` のようにスキーム名へ挟むだけで
 * ブラウザが javascript: として解釈するため。除去しないまま前方一致で見ると素通りする。
 *
 * Why not すべての空白・制御文字を落とす: ブラウザが位置を問わず無視するのはこの 3 文字だけで、
 * 空白は前後を除いて `%20` になる。まとめて落とすと `/report/a b` が `/report/ab` へ化け、
 * 正当なリンクがエラーもログもなく別の URL になる。
 */
function sanitizeUrl(raw: string): string | null {
  const cleaned = Array.from(raw)
    .filter((ch) => !URL_IGNORED_CHAR_CODES.has(ch.charCodeAt(0)))
    .join('')
    .trim();
  if (cleaned === '') return null;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned);
  if (scheme && !ALLOWED_URL_SCHEMES.has(`${scheme[1].toLowerCase()}:`)) return null;

  // スキームが無いものは相対・ルート相対・フラグメント、または protocol-relative（`//host/...`）。
  // 最後のものだけは外部オリジンへ出るが、継承するスキームはページと同じ http(s) に限られるため
  // 許可スキームの制約からは外れない（「スキーム無し＝同一オリジン」ではない点に注意）。
  return cleaned.split(' ').join('%20');
}

function titleAttribute(title: string | null | undefined): string {
  return title ? ` title="${escapeHtml(title)}"` : '';
}

const renderer = {
  /**
   * Markdown 中の生 HTML はブロック・インラインとも要素化せずエスケープする。
   * 記事本文は CMS 経由で書き換えられるため、本文から script / イベントハンドラ属性へ
   * 到達する経路を残さない。
   */
  html({ text }: Tokens.HTML | Tokens.Tag): string {
    return escapeHtml(text);
  },

  link(this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } }, { href, title, tokens }: Tokens.Link): string {
    const text = this.parser.parseInline(tokens);
    const safeHref = sanitizeUrl(href);
    // 許可できない遷移先はリンクを剥がし、本文のテキストだけ残す（文章は欠けさせない）
    if (!safeHref) return text;
    return `<a href="${escapeHtml(safeHref)}"${titleAttribute(title)}>${text}</a>`;
  },

  image({ href, title, text }: Tokens.Image): string {
    const alt = escapeHtml(text);
    const safeSrc = sanitizeUrl(href);
    if (!safeSrc) return alt;
    return `<img src="${escapeHtml(safeSrc)}" alt="${alt}"${titleAttribute(title)} loading="lazy" />`;
  },
};

const markdown = new Marked({ gfm: true, async: false, renderer });

/**
 * 記事本文の Markdown を、SSR の HTML へそのまま差し込める文字列へ変換する。
 *
 * 生 HTML は要素にならないため、戻り値に本文由来のスクリプトは含まれない。
 */
export function renderMarkdownToSafeHtml(source: string): string {
  if (source.trim() === '') return '';
  return markdown.parse(source, { async: false });
}
