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
  gifSettings: Map<string, string>;
} {
  const { frontmatter, body: bodyWithoutFm } = parseFrontmatter(text);
  const { comments, body } = parseCommentData(bodyWithoutFm);
  const { imageAnnotations, body: bodyWithoutAnnotations } = extractImageAnnotations(body);
  const { gifSettings, body: bodyWithoutGifSettings } = extractGifSettings(bodyWithoutAnnotations);
  const sanitized = preserveBlankLines(sanitizeMarkdown(bodyWithoutGifSettings));
  return { frontmatter, comments, body: sanitized, imageAnnotations, gifSettings };
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
 * Markdown 本文から `<!-- gif-settings: {...} -->` コメントを抽出し、
 * 直前の GIF 画像の src と紐付ける。
 */
const GIF_COMMENT_START = "<!-- gif-settings:";
const GIF_COMMENT_END = "-->";

/** 直前行から画像 src を抽出。見つからなければ null。 */
export function extractImageSrc(prevLine: string): string | null {
  const imgStart = prevLine.indexOf("![");
  if (imgStart < 0) return null;
  const bracketEnd = prevLine.indexOf("](", imgStart + 2);
  if (bracketEnd < 0) return null;
  const parenEnd = prevLine.indexOf(")", bracketEnd + 2);
  if (parenEnd < 0) return null;
  return prevLine.slice(bracketEnd + 2, parenEnd);
}

/** gif-settings コメントから有効な JSON を抽出。無効なら null。 */
export function extractValidJson(trimmed: string): string | null {
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  const json = trimmed.slice(jsonStart, jsonEnd + 1);
  try {
    JSON.parse(json);
    return json;
  } catch {
    return null;
  }
}

export function extractGifSettings(md: string): {
  gifSettings: Map<string, string>;
  body: string;
} {
  const result = new Map<string, string>();
  const lines = md.split("\n");
  const outputLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(GIF_COMMENT_START) && trimmed.endsWith(GIF_COMMENT_END) && i > 0) {
      const src = extractImageSrc(lines[i - 1]);
      const json = src != null ? extractValidJson(trimmed) : null;
      if (src != null && json != null) {
        result.set(src, json);
        i++;
        continue;
      }
    }
    outputLines.push(lines[i]);
    i++;
  }
  return { gifSettings: result, body: outputLines.join("\n") };
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
