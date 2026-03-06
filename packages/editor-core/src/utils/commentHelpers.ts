import { splitByCodeBlocks } from "./sanitizeMarkdown";

/** インラインコメントのデータ構造 */
export interface InlineComment {
  id: string;
  text: string;
  resolved: boolean;
  createdAt: string;
}

/**
 * コメントデータブロックの正規表現。
 * 末尾の `<!-- comments\n...\n-->` ブロックにマッチする。
 */
const COMMENT_BLOCK_RE = /\n?\n<!-- comments\n([\s\S]*?)\n-->\s*$/;

/**
 * コメントデータ行の正規表現。
 * `[resolved] id: text | createdAt` または `id: text | createdAt` にマッチ。
 * テキスト内のパイプ文字に対応するため、最後の `|` で分割する（`(.*)` 貪欲）。
 */
const COMMENT_LINE_RE =
  /^(?:\[resolved\]\s+)?([^:]+):\s*(.*)\s*\|\s*(\S+)\s*$/;

/**
 * Markdown 末尾の `<!-- comments -->` ブロックからコメントデータを抽出する。
 *
 * @returns comments: コメント Map、body: コメントデータブロック除去後の本文
 */
export function parseCommentData(md: string): {
  comments: Map<string, InlineComment>;
  body: string;
} {
  const comments = new Map<string, InlineComment>();
  const match = md.match(COMMENT_BLOCK_RE);
  if (!match) {
    return { comments, body: md };
  }

  const block = match[1];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lineMatch = trimmed.match(COMMENT_LINE_RE);
    if (!lineMatch) continue;

    const resolved = trimmed.startsWith("[resolved]");
    const id = lineMatch[1].trim();
    const text = lineMatch[2].trim().replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
    const createdAt = lineMatch[3].trim();

    comments.set(id, { id, text, resolved, createdAt });
  }

  const body = md.slice(0, match.index!).trimEnd();
  return { comments, body };
}

/**
 * Markdown 内のコメントマーカーを HTML タグに変換する。
 * コードブロック内はスキップする。
 *
 * - `<!-- comment-start:id -->text<!-- comment-end:id -->` → `<span data-comment-id="id">text</span>`
 * - `<!-- comment-point:id -->` → `<span data-comment-point="id"></span>`
 */
export function preprocessComments(md: string): string {
  const parts = splitByCodeBlocks(md);
  return parts
    .map((part) => {
      if (/^```/.test(part)) return part;
      return convertCommentMarkers(part);
    })
    .join("");
}

function convertCommentMarkers(text: string): string {
  // Range comments: <!-- comment-start:id -->content<!-- comment-end:id -->
  let result = text.replace(
    /<!-- comment-start:(\S+?) -->([\s\S]*?)<!-- comment-end:\1 -->/g,
    '<span data-comment-id="$1">$2</span>',
  );
  // Point comments: <!-- comment-point:id -->
  result = result.replace(
    /<!-- comment-point:(\S+?) -->/g,
    '<span data-comment-point="$1"></span>',
  );
  return result;
}

/**
 * serialize 後の Markdown にコメントデータブロックを末尾に付加する。
 * コメントが空の場合は何も付加しない。
 */
export function appendCommentData(
  md: string,
  comments: Map<string, InlineComment>,
): string {
  if (comments.size === 0) return md;

  const lines: string[] = [];
  for (const comment of comments.values()) {
    const prefix = comment.resolved ? "[resolved] " : "";
    const escapedText = comment.text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
    lines.push(`${prefix}${comment.id}: ${escapedText} | ${comment.createdAt}`);
  }

  return `${md}\n\n<!-- comments\n${lines.join("\n")}\n-->`;
}
