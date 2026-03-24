import { splitByCodeBlocks } from "./sanitizeMarkdown";

/**
 * Markdown 中の脚注参照 [^id]（定義行 [^id]: は除外）を
 * <sup data-footnote-ref="id">id</sup> に変換する。
 * 脚注定義行 [^id]: は markdown-it のリンク参照定義として消費されないよう
 * 先頭の [ をエスケープする（\[^id]: → テキストとして保持）。
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
      let protected_ = part.replaceAll(/(`+)(.*?)\1/g, (m) => {
        codeSpans.push(m);
        return `\uE000CS${codeSpans.length - 1}\uE000`;
      });
      // 脚注定義行 [^id]: の [ をエスケープして markdown-it のリンク参照定義を防止
      protected_ = protected_.replaceAll(
        /^\[\^([^\]]+)\]:/gm,
        "\\[^$1]:",
      );
      // [^id]（定義行 [^id]: は除外）を <sup> に変換
      protected_ = protected_.replaceAll(
        /\[\^([^\]]+)\](?!:)/g,
        '<sup data-footnote-ref="$1">$1</sup>',
      );
      // コードスパンを復元
      protected_ = protected_.replaceAll(/\uE000CS(\d+)\uE000/g, (_, i) => codeSpans[Number(i)]);
      return protected_;
    })
    .join("");
}
