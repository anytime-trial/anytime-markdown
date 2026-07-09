import { splitByCodeBlocks } from "./sanitizeMarkdown";

/**
 * `from` 以降で、長さ `len` のバッククォート連続を最初に見つけた位置を返す。
 * 改行をまたいだ探索は行わない（コードスパンは行内に閉じる必要がある）。見つからなければ -1。
 */
function findCodeSpanCloser(text: string, from: number, len: number): number {
  for (let p = from; p + len <= text.length; p += 1) {
    if (text[p] === "\n") return -1;
    let matched = 0;
    while (matched < len && text[p + matched] === "`") matched += 1;
    if (matched === len) return p;
  }
  return -1;
}

/**
 * コードスパン（`code` / ``co`de`` 等）をプレースホルダへ退避する。
 * 正規表現 /(`+)(.*?)\1/ は開始バッククォート列の長さに比例して再試行が発生し
 * 入力長との積で計算量が膨らむ（CodeQL js/polynomial-redos）ため、線形走査で置き換える。
 */
function protectCodeSpans(text: string, codeSpans: string[]): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "`") {
      out += text[i];
      i += 1;
      continue;
    }
    let openEnd = i;
    while (openEnd < text.length && text[openEnd] === "`") openEnd += 1;
    const fenceLen = openEnd - i;
    const closer = findCodeSpanCloser(text, openEnd, fenceLen);
    if (closer === -1) {
      out += text.slice(i, openEnd);
      i = openEnd;
      continue;
    }
    codeSpans.push(text.slice(i, closer + fenceLen));
    out += `CS${codeSpans.length - 1}`;
    i = closer + fenceLen;
  }
  return out;
}

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
      let protected_ = protectCodeSpans(part, codeSpans);
      // 脚注定義行 [^id]: の [ をエスケープして markdown-it のリンク参照定義を防止
      protected_ = protected_.replaceAll(
        /^\[\^([^\]]+)\]:/gm,
        String.raw`\[^$1]:`,
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
