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
} {
  const { frontmatter, body: bodyWithoutFm } = parseFrontmatter(text);
  const { comments, body } = parseCommentData(bodyWithoutFm);
  const sanitized = preserveBlankLines(sanitizeMarkdown(body));
  return { frontmatter, comments, body: restoreImageAnnotations(sanitized) };
}

/**
 * Markdown 内の `<!-- img-annotations: [...] -->` を直前の `![]()`  を
 * `<img>` タグに変換して `data-annotations` 属性を付与する。
 * Base64 src の特殊文字を考慮し、正規表現ではなく文字列操作で処理する。
 */
function restoreImageAnnotations(md: string): string {
  const marker = "\n<!-- img-annotations: ";
  const markerEnd = " -->";
  let result = md;
  let searchStart = 0;

  while (true) {
    const mIdx = result.indexOf(marker, searchStart);
    if (mIdx === -1) break;

    const jsonStart = mIdx + marker.length;
    const jsonEnd = result.indexOf(markerEnd, jsonStart);
    if (jsonEnd === -1) break;

    const json = result.slice(jsonStart, jsonEnd);

    // マーカーの直前が ![alt](src) かチェック（閉じ括弧を逆方向に探す）
    const beforeMarker = result.slice(0, mIdx);
    const closeParen = beforeMarker.lastIndexOf(")");
    if (closeParen === -1) { searchStart = jsonEnd + markerEnd.length; continue; }

    // src の開始括弧を逆方向に探す（ネスト非対応、最後の ]( を検索）
    const openBracket = beforeMarker.lastIndexOf("](");
    if (openBracket === -1 || openBracket >= closeParen) { searchStart = jsonEnd + markerEnd.length; continue; }

    const src = beforeMarker.slice(openBracket + 2, closeParen);

    // alt テキストを取得: ![ から ] まで
    const imgStart = beforeMarker.lastIndexOf("![", openBracket);
    if (imgStart === -1) { searchStart = jsonEnd + markerEnd.length; continue; }

    const alt = beforeMarker.slice(imgStart + 2, openBracket);

    const escapedJson = json.replace(/"/g, "&quot;");
    const imgTag = `<img src="${src}" alt="${alt}" data-annotations="${escapedJson}" />`;

    // ![alt](src)\n<!-- img-annotations: ... --> を <img> タグに置換
    result = result.slice(0, imgStart) + imgTag + result.slice(jsonEnd + markerEnd.length);
    searchStart = imgStart + imgTag.length;
  }

  return result;
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
