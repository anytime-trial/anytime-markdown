import DOMPurify from "dompurify";

const ALLOWED_TAGS = ["details", "summary", "br", "hr", "sub", "sup", "mark", "kbd", "u"];
const ALLOWED_ATTR = ["open"];

/** 空行保持用の Zero-Width Space マーカー */
export const BLANK_LINE_MARKER = "\u200B";

/**
 * マークダウン文字列中のHTMLをサニタイズする。
 * 許可リスト外のタグは除去し、テキスト内容は保持する。
 * コードブロック（```...```）内はサニタイズ対象外とし、
 * DOMPurify による &gt; 等のエスケープを防ぐ。
 */
export function sanitizeMarkdown(md: string): string {
  // コードブロック境界で分割し、コードブロック外のみサニタイズ
  const parts = md.split(/(^```[^\n]*\n[\s\S]*?^```)/gm);
  return parts
    .map((part) => {
      if (/^```/.test(part)) return part;
      // DOMPurify は前後の改行を除去するため、退避して復元する
      const leadingNL = part.match(/^\n*/)?.[0] ?? "";
      const trailingNL = part.match(/\n*$/)?.[0] ?? "";
      const inner = part.slice(leadingNL.length, part.length - (trailingNL.length || 0));
      if (!inner) return part;
      // DOMPurify でサニタイズ後、マークダウンで意味を持つ文字の
      // HTMLエンティティを元に戻す
      const sanitized = DOMPurify.sanitize(inner, { ALLOWED_TAGS, ALLOWED_ATTR, KEEP_CONTENT: true })
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
      return leadingNL + sanitized + trailingNL;
    })
    .join("");
}

/**
 * 連続する空行（3つ以上の改行）を ZWSP マーカー段落に変換して保持する。
 * markdown-it (CommonMark) は連続空行を1つに圧縮するため、
 * 余分な空行を ZWSP 段落として挿入し、パース後も空行数を維持する。
 * コードブロック内はそのまま保持する。
 */
export function preserveBlankLines(md: string): string {
  const parts = md.split(/(^```[^\n]*\n[\s\S]*?^```)/gm);
  return parts
    .map((part) => {
      if (/^```/.test(part)) return part;
      return part.replace(/\n{3,}/g, (match) => {
        const extra = match.length - 2;
        return "\n\n" + `${BLANK_LINE_MARKER}\n\n`.repeat(extra);
      });
    })
    .join("");
}

/**
 * シリアライズされたマークダウンから ZWSP マーカーを除去し、
 * 元の空行を復元する。
 */
export function restoreBlankLines(md: string): string {
  return md.replace(/\u200B\n/g, "");
}
