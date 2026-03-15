import type { Editor } from "@tiptap/react";

import { commentDataPluginKey } from "../extensions/commentExtension";
import { getMarkdownStorage } from "../types";
import type { InlineComment } from "./commentHelpers";
import { appendCommentData } from "./commentHelpers";
import { getTrailingNewline } from "./editorContentLoader";
import { postprocessMathBlock } from "./mathHelpers";
import { normalizeCodeSpanDelimitersInLine, restoreBlankLines } from "./sanitizeMarkdown";

/** tiptap-markdown の storage から markdown を取得するヘルパー */
export function getMarkdownFromEditor(editor: Editor): string {
  let md = getMarkdownStorage(editor).getMarkdown();
  // ZWSP マーカー段落を除去し、元の空行を復元する
  // ※ コードフェンス修正より先に実行する（ZWSP が残っていると正規表現が一致しないため）
  md = restoreBlankLines(md);
  // blockquote 内のハードブレイク（\↩）後に > が欠落する tiptap-markdown の不具合を補正
  // 例: "> line1\\\nline2" → "> line1\\\n> line2"
  md = md.replace(/^(> .+)\\\n(?!>)/gm, "$1\\\n> ");
  // blockquote 内のハードブレイクで bold 閉じ ** と次行の bold 開き ** が連結して
  // **** になる tiptap-markdown の不具合を補正
  // 例: "> ****text**" → "> **text**"
  md = md.replace(/^(> )\*{4}/gm, "$1**");
  // preserveBlankLines で分離された連続 blockquote を1つに結合する
  // 例: "> text1\n\n> text2" → "> text1\n>\n> text2"
  md = md.replace(/^(> .+)\n\n(?=> )/gm, "$1\n>\n");
  // リスト内ハードブレイク後の継続行に tiptap-markdown が付与する
  // 2スペースインデントを除去する（元のインデントなしを保持）
  md = md.replace(/\\\n {2}(?! )/gm, "\\\n");
  // NOTE: ProseMirror はブロック間を \n\n に正規化するため、
  // 元の \n が \n\n に変わる場合がある。これは ProseMirror の仕様として許容する。
  // ```math フェンスが残っている場合に $$...$$ に変換する（フォールバック）
  md = postprocessMathBlock(md);
  // NOTE: テーブルセル内のハードブレイクは CustomHardBreak の serialize で
  // <br> として出力されるため、後処理は不要
  // テーブル行内で prosemirror-markdown がエスケープした文字を復元する
  // (例: "1\." → "1.", "\#" → "#")
  // + コードスパンのバッククォート区切りをテーブル行内のみ最小限に正規化
  md = md.replace(/^(\|.+\|)$/gm, (line) => {
    line = line.replace(/\\([.#>+\-*])/g, "$1");
    // コードスパンを保護: &lt;/&gt; 復元の対象外 + 内部の | を \| にエスケープ
    const codeSpans: string[] = [];
    line = line.replace(/(?<!`)(`+)(?!`)(.*?)(?<!`)\1(?!`)/g, (m) => {
      // コードスパン内の | を \| にエスケープ（テーブルセル区切りとの衝突防止）
      codeSpans.push(m.replace(/(?<!\\)\|/g, "\\|"));
      return `\uE001CS${codeSpans.length - 1}\uE001`;
    });
    line = line.replace(/&gt;/g, ">").replace(/&lt;/g, "<");
    line = line.replace(/\uE001CS(\d+)\uE001/g, (_, i) => codeSpans[Number(i)]);
    // 空セルの余分なスペースを正規化: "|  |" → "| |"
    line = line.replace(/\| {2,}(?=\|)/g, "| ");
    return normalizeCodeSpanDelimitersInLine(line);
  });
  // Plugin State からコメントデータを取得し、末尾に付加
  const commentState = editor.state
    ? commentDataPluginKey.getState(editor.state) as { comments: Map<string, InlineComment> } | undefined
    : undefined;
  if (commentState?.comments && commentState.comments.size > 0) {
    md = appendCommentData(md, commentState.comments);
  }
  // applyMarkdownToEditor で記録された末尾改行フラグに基づき復元する
  if (md && getTrailingNewline(editor) && !md.endsWith("\n")) {
    md += "\n";
  }
  return md;
}
