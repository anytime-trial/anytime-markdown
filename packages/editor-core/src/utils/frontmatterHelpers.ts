/**
 * YAML フロントマターのパース/シリアライズユーティリティ。
 *
 * ドキュメント先頭の `---\n...\n---` ブロックをフロントマターとして抽出し、
 * エディタ本文とは別に管理する。YAML の構造解析は行わず文字列のまま保持する。
 */

import { type InlineComment, parseCommentData } from "./commentHelpers";
import { preserveBlankLines, sanitizeMarkdown } from "./sanitizeMarkdown";

const FENCE = "---";

/**
 * Markdown 先頭からフロントマターを抽出する。
 *
 * @returns frontmatter: YAML 文字列（なければ null）、body: フロントマター除去後の本文
 */
export function parseFrontmatter(md: string): {
  frontmatter: string | null;
  body: string;
} {
  if (!md.startsWith(FENCE + "\n")) {
    return { frontmatter: null, body: md };
  }

  const contentStart = FENCE.length + 1; // "---\n" の直後
  const closingIdx = md.indexOf("\n" + FENCE, contentStart);
  if (closingIdx === -1) {
    return { frontmatter: null, body: md };
  }

  const frontmatter = md.slice(contentStart, closingIdx);
  const afterFence = closingIdx + 1 + FENCE.length; // "\n---" の直後

  // フェンス直後の改行をスキップ（最大2つ: \n\n）
  let bodyStart = afterFence;
  if (bodyStart < md.length && md[bodyStart] === "\n") bodyStart++;
  if (bodyStart < md.length && md[bodyStart] === "\n") bodyStart++;

  const body = md.slice(bodyStart);
  return { frontmatter, body };
}

/**
 * Markdown テキストからフロントマター・コメントを分離し、本文をサニタイズして返す。
 *
 * parseFrontmatter → parseCommentData → sanitizeMarkdown → preserveBlankLines
 * の順序を一箇所に固定し、順序誤りによるフロントマター破壊を防ぐ。
 */
export function preprocessMarkdown(text: string): {
  frontmatter: string | null;
  comments: Map<string, InlineComment>;
  body: string;
  imageAnnotations: Map<string, string>;
} {
  const { frontmatter, body: bodyWithoutFm } = parseFrontmatter(text);
  const { comments, body } = parseCommentData(bodyWithoutFm);
  const { imageAnnotations, body: bodyWithoutAnnotations } = extractImageAnnotations(body);
  const sanitized = preserveBlankLines(sanitizeMarkdown(bodyWithoutAnnotations));
  return { frontmatter, comments, body: sanitized, imageAnnotations };
}

/**
 * Markdown 末尾の `<!-- image-comments -->` ブロックを抽出する。
 */
function extractImageAnnotations(md: string): {
  imageAnnotations: Map<string, string>;
  body: string;
} {
  const result = new Map<string, string>();
  const marker = "\n<!-- image-comments\n";
  const markerEnd = "\n-->";
  const idx = md.indexOf(marker);
  if (idx === -1) return { imageAnnotations: result, body: md };

  const dataStart = idx + marker.length;
  const dataEnd = md.indexOf(markerEnd, dataStart);
  if (dataEnd === -1) return { imageAnnotations: result, body: md };

  const block = md.slice(dataStart, dataEnd);
  for (const line of block.split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx);
    const data = line.slice(eqIdx + 1);
    result.set(key, data);
  }

  const body = md.slice(0, idx) + md.slice(dataEnd + markerEnd.length);
  return { imageAnnotations: result, body };
}

/**
 * フロントマターを Markdown 本文の先頭に付加する。
 *
 * @param body Markdown 本文
 * @param frontmatter YAML 文字列（null の場合は何も付加しない）
 */
export function prependFrontmatter(body: string, frontmatter: string | null): string {
  if (frontmatter === null) return body;
  return `${FENCE}\n${frontmatter}\n${FENCE}\n\n${body}`;
}
