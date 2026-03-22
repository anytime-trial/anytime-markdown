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
      if (part.startsWith("```")) return part;
      // コードスパン内の [^id] を保護してから変換する
      // バッククォートで囲まれた部分をプレースホルダに退避
      const codeSpans: string[] = [];
      let protected_ = part.replace(/(`+)(.*?)\1/g, (m) => {
        codeSpans.push(m);
        return `\uE000CS${codeSpans.length - 1}\uE000`;
      });
      // [^id]（定義行 [^id]: は除外）を <sup> に変換
      protected_ = protected_.replace(
        /\[\^([^\]]+)\](?!:)/g,
        '<sup data-footnote-ref="$1">$1</sup>',
      );
      // コードスパンを復元
      protected_ = protected_.replace(/\uE000CS(\d+)\uE000/g, (_, i) => codeSpans[Number(i)]);
      return protected_;
    })
    .join("");
}
