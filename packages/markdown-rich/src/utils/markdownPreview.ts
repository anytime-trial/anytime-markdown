import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";

import { ensureStyle } from "@anytime-markdown/ui-core/dom";

/**
 * markdown プレビュー専用の DOMPurify allowlist。
 *
 * html フェンス用の `HTML_SANITIZE_CONFIG` を流用しない。あちらは意図的に HTML を描画する
 * 用途のため `form` / `input` / `button` まで許可しており、markdown-it が生成し得る範囲より
 * 広い。共有すると html 側の allowlist 緩和が markdown 側へ意図せず波及する。
 *
 * DOMPurify は渡された cfg 配列を in-place で小文字化するため、共有定数は凍結して防御する。
 */
const MARKDOWN_SANITIZE_CONFIG = {
  ALLOWED_TAGS: Object.freeze([
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td",
    "strong", "em", "b", "i", "s", "del", "code", "pre", "sub", "sup", "mark",
    "a", "img", "blockquote",
  ]) as string[],
  ALLOWED_ATTR: Object.freeze([
    "href", "src", "alt", "title", "target", "rel",
    "colspan", "rowspan", "align",
  ]) as string[],
  ALLOW_DATA_ATTR: false,
};

/**
 * `markdown` フェンスの本文を、プレビュー描画用の HTML へ変換する純関数。
 *
 * セキュリティは二層で担保する。
 * 1. `html: false` — フェンス内の生 HTML はレンダリングせずエスケープする。
 *    `html` フェンス（意図的に HTML を描画する）とは責務を分ける。
 * 2. `DOMPurify.sanitize` — 1 を突破した場合に備え {@link MARKDOWN_SANITIZE_CONFIG} を通す。
 *
 * `linkify` は裸の URL を `<a>` 化する。危険なスキームは DOMPurify が落とす。
 */
const md = new MarkdownIt({ html: false, linkify: true });

export function renderMarkdownPreviewHtml(code: string): string {
  return DOMPurify.sanitize(md.render(code), MARKDOWN_SANITIZE_CONFIG);
}

const MARKDOWN_PREVIEW_STYLE_ID = "am-markdown-fence-preview";

/**
 * プレビュー枠内のブラウザ既定スタイル（`h1` が 2em・大きな margin）を、本文の文字サイズへ
 * 寄せる。色は指定せず継承させることでダーク/ライト両モードに自動追従する。
 */
export function ensureMarkdownPreviewStyle(): void {
  ensureStyle(MARKDOWN_PREVIEW_STYLE_ID, `
    .rich-codeblock-markdown-preview { padding: 12px; line-height: 1.6; }
    .rich-codeblock-markdown-preview > :first-child { margin-top: 0; }
    .rich-codeblock-markdown-preview > :last-child { margin-bottom: 0; }
    .rich-codeblock-markdown-preview h1 { font-size: 1.5em; }
    .rich-codeblock-markdown-preview h2 { font-size: 1.3em; }
    .rich-codeblock-markdown-preview h3 { font-size: 1.15em; }
    .rich-codeblock-markdown-preview h4,
    .rich-codeblock-markdown-preview h5,
    .rich-codeblock-markdown-preview h6 { font-size: 1em; }
    .rich-codeblock-markdown-preview h1,
    .rich-codeblock-markdown-preview h2,
    .rich-codeblock-markdown-preview h3,
    .rich-codeblock-markdown-preview h4,
    .rich-codeblock-markdown-preview h5,
    .rich-codeblock-markdown-preview h6 { margin: 0.8em 0 0.4em; line-height: 1.3; }
    .rich-codeblock-markdown-preview p,
    .rich-codeblock-markdown-preview ul,
    .rich-codeblock-markdown-preview ol,
    .rich-codeblock-markdown-preview blockquote { margin: 0.5em 0; }
    .rich-codeblock-markdown-preview table { border-collapse: collapse; }
    .rich-codeblock-markdown-preview th,
    .rich-codeblock-markdown-preview td {
      border: 1px solid var(--am-color-divider);
      padding: 4px 8px;
    }
    .rich-codeblock-markdown-preview pre {
      background: var(--am-color-code-bg);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
    }
    .rich-codeblock-markdown-preview blockquote {
      border-left: 3px solid var(--am-color-divider);
      padding-left: 12px;
    }
    .rich-codeblock-markdown-preview img { max-width: 100%; height: auto; }
  `);
}
