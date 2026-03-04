import { splitByCodeBlocks } from "./sanitizeMarkdown";

/**
 * Markdown 中の脚注参照 [^id]（定義行 [^id]: は除外）を
 * <sup data-footnote-ref="id">id</sup> に変換する。
 * コードブロック内はスキップする。
 */
export function preprocessFootnoteRefs(md: string): string {
  const parts = splitByCodeBlocks(md);
  return parts
    .map((part) => {
      if (/^```/.test(part)) return part;
      // [^id]（定義行 [^id]: は除外）を <sup> に変換
      return part.replace(
        /\[\^([^\]]+)\](?!:)/g,
        '<sup data-footnote-ref="$1">$1</sup>',
      );
    })
    .join("");
}
