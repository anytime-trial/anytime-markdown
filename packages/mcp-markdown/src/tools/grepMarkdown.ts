/**
 * Markdown ファイル内のリテラル部分一致検索。一致行に「行番号＋直近の囲み見出し＋snippet」を付けて返す。
 * search_docs の文書内版（全文 Read を一致行＋見出しに圧縮）。
 *
 * ReDoS 回避（code-quality 18.2）: v1 はリテラル部分一致のみ（indexOf）。正規表現は受け付けない。
 */

import fs from 'node:fs/promises';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';
import { extractHeadingsFromText, type HeadingNode } from './getOutline';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];
const DEFAULT_MAX_MATCHES = 20;
/** snippet の一致位置前後の文字数。 */
const SNIPPET_RADIUS = 40;

export interface GrepMarkdownInput {
  path: string;
  pattern: string;
  ignoreCase?: boolean;
  maxMatches?: number;
}

export interface GrepMatch {
  /** 1-based 行番号。 */
  line: number;
  /** 直近の囲み見出しテキスト（無ければ空文字）。 */
  heading: string;
  /** 一致箇所前後の抜粋（前後省略は … で示す）。 */
  snippet: string;
}

/** 一致行 lineNo（1-based）を囲む直近の見出しテキストを返す。 */
function enclosingHeading(headings: HeadingNode[], lineNo: number): string {
  let current = '';
  for (const h of headings) {
    if (h.line <= lineNo) current = h.text;
    else break;
  }
  return current;
}

/** Markdown テキストをリテラル部分一致で grep する純粋関数。 */
export function grepMarkdownText(
  markdown: string,
  pattern: string,
  opts: { ignoreCase?: boolean; maxMatches?: number } = {},
): GrepMatch[] {
  if (!pattern) return [];
  const maxMatches = opts.maxMatches ?? DEFAULT_MAX_MATCHES;
  const ignoreCase = opts.ignoreCase ?? false;
  const needle = ignoreCase ? pattern.toLowerCase() : pattern;
  const headings = extractHeadingsFromText(markdown);
  const lines = markdown.split('\n');
  const matches: GrepMatch[] = [];

  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    const line = lines[i];
    const haystack = ignoreCase ? line.toLowerCase() : line;
    const idx = haystack.indexOf(needle);
    if (idx === -1) continue;

    const lineNo = i + 1;
    const start = Math.max(0, idx - SNIPPET_RADIUS);
    const end = Math.min(line.length, idx + needle.length + SNIPPET_RADIUS);
    let snippet = line.slice(start, end);
    if (start > 0) snippet = `…${snippet}`;
    if (end < line.length) snippet = `${snippet}…`;

    matches.push({ line: lineNo, heading: enclosingHeading(headings, lineNo), snippet });
  }
  return matches;
}

export async function grepMarkdown(input: GrepMarkdownInput, rootDir: string): Promise<GrepMatch[]> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  const filePath = resolveSecurePath(rootDir, input.path);
  const content = await fs.readFile(filePath, 'utf-8');
  return grepMarkdownText(content, input.pattern, {
    ignoreCase: input.ignoreCase,
    maxMatches: input.maxMatches,
  });
}
