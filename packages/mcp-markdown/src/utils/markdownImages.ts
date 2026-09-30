import {
  extractGifSettings,
  parseFrontmatter,
} from '@anytime-markdown/markdown-editor/internal/utils/frontmatterHelpers';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

export interface BodyImage {
  index: number;
  src: string;
  alt: string;
  line: number;
  heading?: string;
}

// エディタ（tiptap-markdown）と同じ markdown-it 設定。
// Why not: 正規表現で数えない。コード内の記法・エスケープ・参照式・HTML の img を
// エディタと同じに扱えず、番号が 1 つずれるとそれ以降の注記がすべて対応しなくなる。
const md = new MarkdownIt({ html: true, linkify: false, breaks: false });

const HTML_IMG_RE = /<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
const HTML_ALT_RE = /\salt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

interface Collector {
  images: BodyImage[];
  heading?: string;
  lineOffset: number;
  gifSrcs: ReadonlySet<string>;
}

function push(c: Collector, src: string, alt: string, line: number): void {
  if (c.gifSrcs.has(src)) return;
  c.images.push({ index: c.images.length, src, alt, line: c.lineOffset + line, heading: c.heading });
}

function countNewlines(text: string, end: number): number {
  let n = 0;
  for (let i = text.indexOf('\n'); i !== -1 && i < end; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

/**
 * 画像の alt をエスケープ解決済みのテキストで組み立てる。
 * Why not: renderer.renderInlineAsText を使わない。markdown-it 14 はエスケープ文字を text_special にし、
 * text へまとめる core ルール（text_join）は画像の子トークンまで降りないため、`\[` 等が落ちる。
 */
function altText(children: readonly Token[]): string {
  let out = '';
  for (const t of children) {
    if (t.type === 'text' || t.type === 'text_special' || t.type === 'code_inline') out += t.content;
    else if (t.type === 'image') out += altText(t.children ?? []);
    else if (t.type === 'softbreak' || t.type === 'hardbreak') out += '\n';
  }
  return out;
}

/** HTML ブロック・インライン HTML 内の <img>（エディタは img[src] を画像ノードとして読む） */
function collectHtmlImages(c: Collector, html: string, line: number): void {
  if (html.trimStart().startsWith('<!--')) return;
  for (const match of html.matchAll(HTML_IMG_RE)) {
    const src = match[1] ?? match[2] ?? match[3] ?? '';
    const altMatch = HTML_ALT_RE.exec(match[0]);
    const alt = altMatch ? (altMatch[1] ?? altMatch[2] ?? altMatch[3] ?? '') : '';
    push(c, src, alt, line + countNewlines(html, match.index ?? 0));
  }
}

function collectInline(c: Collector, inline: Token): void {
  const startLine = (inline.map?.[0] ?? 0) + 1;
  let breaks = 0;
  for (const child of inline.children ?? []) {
    if (child.type === 'softbreak' || child.type === 'hardbreak') breaks++;
    else if (child.type === 'image') {
      push(c, child.attrGet('src') ?? '', altText(child.children ?? []), startLine + breaks);
    }
    else if (child.type === 'html_inline') collectHtmlImages(c, child.content, startLine + breaks);
  }
}

/**
 * 本文の画像を、エディタが注記を保存するときの通し番号の順で列挙する。
 * - フロントマターは除き、行番号は元の文書の行（1 始まり）で返す
 * - 有効な gif-settings が付いた画像は保存時に gifBlock になり番号に数えられないため除く
 */
export function listBodyImages(markdown: string): BodyImage[] {
  const text = markdown.replaceAll('\r\n', '\n');
  const { body } = parseFrontmatter(text);
  const c: Collector = {
    images: [],
    lineOffset: countNewlines(text, text.length - body.length),
    gifSrcs: new Set(extractGifSettings(body).gifSettings.keys()),
  };
  const tokens = md.parse(body, {});
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open') {
      c.heading = `${'#'.repeat(Number(token.tag.slice(1)))} ${tokens[i + 1]?.content ?? ''}`;
    } else if (token.type === 'inline') {
      collectInline(c, token);
    } else if (token.type === 'html_block') {
      collectHtmlImages(c, token.content, (token.map?.[0] ?? 0) + 1);
    }
  }
  return c.images;
}
