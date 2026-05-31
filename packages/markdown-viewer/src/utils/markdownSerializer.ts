import type { Editor } from "@tiptap/react";

import { commentDataPluginKey } from "../extensions/commentExtension";
import { getMarkdownStorage } from "../types";
import type { InlineComment } from "./commentHelpers";
import { appendCommentData } from "./commentHelpers";
import { getTrailingNewline } from "./editorContentLoader";
import { postprocessMathBlock } from "./mathHelpers";
import { normalizeCodeSpanDelimitersInLine, restoreBlankLines } from "./sanitizeMarkdown";

/**
 * 画像アノテーションを Markdown 末尾に `<!-- image-comments -->` ブロックとして埋め込む。
 * 各画像は src のハッシュ（先頭20文字）で識別する。
 */
function embedImageAnnotations(editor: Editor, md: string): string {
  if (!editor.state?.doc) return md;
  const entries: { key: string; data: string }[] = [];
  let imgIndex = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image") {
      if (node.attrs.annotations) {
        const src = (node.attrs.src as string) ?? "";
        // src が長い場合（Base64）は先頭20文字 + インデックスで識別
        const key = src.length > 100 ? `img${imgIndex}:${src.slice(0, 20)}` : `img${imgIndex}:${src}`;
        entries.push({ key, data: node.attrs.annotations as string });
      }
      imgIndex++;
    }
  });
  if (entries.length === 0) return md;
  const block = "\n<!-- image-comments\n" +
    entries.map(e => `${e.key}=${e.data}`).join("\n") +
    "\n-->";
  return md + block;
}

/**
 * gifBlock ノードの gifSettings を `<!-- gif-settings: {...} -->` コメントとして
 * 対応する `![alt](src.gif)` 行の直後に埋め込む。
 */
function embedGifSettings(editor: Editor, md: string): string {
  if (!editor.state?.doc) return md;
  const entries: { src: string; alt: string; settings: string }[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "gifBlock" && node.attrs.gifSettings) {
      entries.push({
        src: (node.attrs.src as string) ?? "",
        alt: (node.attrs.alt as string) ?? "",
        settings: node.attrs.gifSettings as string,
      });
    }
  });
  if (entries.length === 0) return md;
  let result = md;
  for (const entry of entries) {
    // ![alt](src.gif) の行を見つけて直後に gif-settings コメントを挿入
    const escapedSrc = entry.src.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const imgPattern = new RegExp(
      String.raw`(!\[[^\]]*\]\(${escapedSrc}\))(?!\s*\n<!-- gif-settings:)`,
    );
    result = result.replace(imgPattern, `$1\n<!-- gif-settings: ${entry.settings} -->`);
  }
  return result;
}

/** tiptap-markdown の storage から markdown を取得するヘルパー */
export function getMarkdownFromEditor(editor: Editor): string {
  let md = getMarkdownStorage(editor).getMarkdown();
  // ZWSP マーカー段落を除去し、元の空行を復元する
  // ※ コードフェンス修正より先に実行する（ZWSP が残っていると正規表現が一致しないため）
  md = restoreBlankLines(md);
  // blockquote 内のハードブレイク（\↩）後に > が欠落する tiptap-markdown の不具合を補正
  // 例: "> line1\\\nline2" → "> line1\\\n> line2"
  md = md.replaceAll(/^(> .+)\\\n(?!>)/gm, "$1\\\n> ");
  // blockquote 内のハードブレイクで bold 閉じ ** と次行の bold 開き ** が連結して
  // **** になる tiptap-markdown の不具合を補正
  // 例: "> ****text**" → "> **text**"
  md = md.replaceAll(/^(> )\*{4}/gm, "$1**");
  // preserveBlankLines で分離された連続 blockquote を1つに結合する
  // 例: "> text1\n\n> text2" → "> text1\n>\n> text2"
  md = md.replaceAll(/^(> .+)\n\n(?=> )/gm, "$1\n>\n");
  // リスト内ハードブレイク後の継続行に tiptap-markdown が付与する
  // 2スペースインデントを除去する（元のインデントなしを保持）
  md = md.replaceAll(/\\\n {2}(?! )/gm, "\\\n");
  // NOTE: ProseMirror はブロック間を \n\n に正規化するため、
  // 元の \n が \n\n に変わる場合がある。これは ProseMirror の仕様として許容する。
  // ```math フェンスが残っている場合に $$...$$ に変換する（フォールバック）
  md = postprocessMathBlock(md);
  // NOTE: テーブルセル内のハードブレイクは CustomHardBreak の serialize で
  // <br> として出力されるため、後処理は不要
  // テーブル行内で prosemirror-markdown がエスケープした文字を復元する
  // (例: "1\." → "1.", "\#" → "#")
  // + コードスパンのバッククォート区切りをテーブル行内のみ最小限に正規化
  md = md.replaceAll(/^(\|.+\|)$/gm, (line) => {
    line = line.replaceAll(/\\([.#>+\-*])/g, "$1");
    // コードスパンを保護: &lt;/&gt; 復元の対象外 + 内部の | を \| にエスケープ
    const codeSpans: string[] = [];
    line = line.replaceAll(/(?<!`)(`+)(?!`)(.*?)(?<!`)\1(?!`)/g, (m) => {
      // コードスパン内の | を \| にエスケープ（テーブルセル区切りとの衝突防止）
      codeSpans.push(m.replaceAll(/(?<!\\)\|/g, String.raw`\|`));
      return `\uE001CS${codeSpans.length - 1}\uE001`;
    });
    line = line.replaceAll("&gt;", ">").replaceAll("&lt;", "<");
    line = line.replaceAll(/\uE001CS(\d+)\uE001/g, (_, i) => codeSpans[Number(i)]);
    // 空セルの余分なスペースを正規化: "|  |" → "| |"
    line = line.replaceAll(/\| {2,}(?=\|)/g, "| ");
    return normalizeCodeSpanDelimitersInLine(line);
  });
  // 画像 src のキャッシュバスター（?t=...）を除去
  md = md.replaceAll(/(!\[[^\]]*\]\([^)?]+)\?t=\d+(\))/g, "$1$2");
  // 画像アノテーションを HTML コメントとして画像の直後に埋め込む
  md = embedImageAnnotations(editor, md);
  // GIF 設定を HTML コメントとして GIF 画像の直後に埋め込む
  md = embedGifSettings(editor, md);
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
