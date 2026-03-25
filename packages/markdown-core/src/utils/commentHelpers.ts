import { splitByCodeBlocks } from "./sanitizeMarkdown";

/** インラインコメントのデータ構造 */
export interface InlineComment {
  id: string;
  text: string;
  resolved: boolean;
  createdAt: string;
}

const COMMENT_BLOCK_START = "\n<!-- comments\n";
const COMMENT_BLOCK_END = "\n-->";

/**
 * コメントデータ行を線形時間でパースする。
 * 形式: `[resolved] id: text | createdAt` または `id: text | createdAt`
 * テキスト内のパイプ文字に対応するため、最後の `|` で分割する。
 */
function parseCommentLine(line: string): { resolved: boolean; id: string; text: string; createdAt: string } | null {
  let s = line;
  const resolved = s.startsWith("[resolved]");
  if (resolved) s = s.slice("[resolved]".length).trimStart();

  const colonIdx = s.indexOf(":");
  if (colonIdx === -1) return null;
  const id = s.slice(0, colonIdx).trim();
  if (!id) return null;

  const rest = s.slice(colonIdx + 1);
  const pipeIdx = rest.lastIndexOf("|");
  if (pipeIdx === -1) return null;

  const text = rest.slice(0, pipeIdx).trim();
  const createdAt = rest.slice(pipeIdx + 1).trim();
  if (!createdAt) return null;

  return { resolved, id, text, createdAt };
}

/**
 * Markdown 末尾の `<!-- comments -->` ブロックからコメントデータを抽出する。
 * indexOf ベースでブロックを検索し、ReDoS を回避する。
 *
 * @returns comments: コメント Map、body: コメントデータブロック除去後の本文
 */
export function parseCommentData(md: string): {
  comments: Map<string, InlineComment>;
  body: string;
} {
  const comments = new Map<string, InlineComment>();

  // 末尾から最後の <!-- comments\n...\n--> を検索
  const startIdx = md.lastIndexOf(COMMENT_BLOCK_START);
  if (startIdx === -1) return { comments, body: md };

  const contentStart = startIdx + COMMENT_BLOCK_START.length;
  const endIdx = md.indexOf(COMMENT_BLOCK_END, contentStart);
  if (endIdx === -1) return { comments, body: md };

  // ブロック末尾以降が空白のみであることを確認
  const after = md.slice(endIdx + COMMENT_BLOCK_END.length);
  if (after.trim() !== "") return { comments, body: md };

  const block = md.slice(contentStart, endIdx);
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = parseCommentLine(trimmed);
    if (!parsed) continue;

    const unescaped = parsed.text.replaceAll(String.raw`\n`, "\n").replaceAll(String.raw`\\`, "\\");
    comments.set(parsed.id, { id: parsed.id, text: unescaped, resolved: parsed.resolved, createdAt: parsed.createdAt });
  }

  // startIdx の前に改行がある場合はそれも除去
  const bodyEnd = startIdx > 0 && md[startIdx - 1] === "\n" ? startIdx - 1 : startIdx;
  const body = md.slice(0, bodyEnd).trimEnd();
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
      if (part.startsWith("```")) return part;
      return convertCommentMarkers(part);
    })
    .join("");
}

function convertCommentMarkers(text: string): string {
  // Range comments: <!-- comment-start:id -->content<!-- comment-end:id -->
  // indexOf ベースで処理し ReDoS を回避
  let result = "";
  let pos = 0;
  const START_PREFIX = "<!-- comment-start:";
  const END_PREFIX = "<!-- comment-end:";
  const MARKER_SUFFIX = " -->";

  while (pos < text.length) {
    const startIdx = text.indexOf(START_PREFIX, pos);
    if (startIdx === -1) {
      result += text.slice(pos);
      break;
    }

    const idStart = startIdx + START_PREFIX.length;
    const suffixIdx = text.indexOf(MARKER_SUFFIX, idStart);
    if (suffixIdx === -1) {
      result += text.slice(pos);
      break;
    }

    const id = text.slice(idStart, suffixIdx);
    if (!id || /\s/.test(id)) {
      result += text.slice(pos, suffixIdx + MARKER_SUFFIX.length);
      pos = suffixIdx + MARKER_SUFFIX.length;
      continue;
    }

    const contentStart = suffixIdx + MARKER_SUFFIX.length;
    const endMarker = `${END_PREFIX}${id}${MARKER_SUFFIX}`;
    const endIdx = text.indexOf(endMarker, contentStart);
    if (endIdx === -1) {
      result += text.slice(pos, contentStart);
      pos = contentStart;
      continue;
    }

    const content = text.slice(contentStart, endIdx);
    result += text.slice(pos, startIdx);
    result += `<span data-comment-id="${id}">${content}</span>`;
    pos = endIdx + endMarker.length;
  }

  // Point comments: <!-- comment-point:id -->
  result = result.replaceAll(
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
    const escapedText = comment.text.replaceAll("\\", String.raw`\\`).replaceAll("\n", String.raw`\n`);
    lines.push(`${prefix}${comment.id}: ${escapedText} | ${comment.createdAt}`);
  }

  return `${md}\n\n<!-- comments\n${lines.join("\n")}\n-->`;
}
