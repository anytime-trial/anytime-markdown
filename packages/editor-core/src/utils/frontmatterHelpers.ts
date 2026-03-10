/**
 * YAML フロントマターのパース/シリアライズユーティリティ。
 *
 * ドキュメント先頭の `---\n...\n---` ブロックをフロントマターとして抽出し、
 * エディタ本文とは別に管理する。YAML の構造解析は行わず文字列のまま保持する。
 */

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
 * フロントマターを Markdown 本文の先頭に付加する。
 *
 * @param body Markdown 本文
 * @param frontmatter YAML 文字列（null の場合は何も付加しない）
 */
export function prependFrontmatter(body: string, frontmatter: string | null): string {
  if (frontmatter === null) return body;
  return `${FENCE}\n${frontmatter}\n${FENCE}\n\n${body}`;
}
