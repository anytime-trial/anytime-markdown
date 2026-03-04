import { splitByCodeBlocks } from "./sanitizeMarkdown";

const ADMONITION_LINE_RE = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;

/**
 * Markdown 文字列中の `> [!TYPE]` 行を検出し、
 * blockquote に data-admonition-type 属性を付与する HTML に変換する。
 *
 * 変換例:
 *   > [!NOTE]        → <blockquote data-admonition-type="note">
 *   > content here   → <p>content here</p></blockquote>
 *
 * コードブロック内はスキップする。
 */
export function preprocessAdmonition(md: string): string {
  const parts = splitByCodeBlocks(md);
  return parts
    .map((part) => {
      if (/^```/.test(part)) return part;
      return processAdmonitions(part);
    })
    .join("");
}

function processAdmonitions(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = lines[i].match(ADMONITION_LINE_RE);
    if (!match) {
      result.push(lines[i]);
      i++;
      continue;
    }

    const type = match[1].toLowerCase();
    // [!TYPE] 行の次から、blockquote の内容行（> で始まる行）を収集
    i++;
    const contentLines: string[] = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      // > プレフィックスを除去
      contentLines.push(lines[i].replace(/^>\s?/, ""));
      i++;
    }

    // HTML blockquote に変換
    const content = contentLines.join("\n");
    result.push(`<blockquote data-admonition-type="${type}">`);
    result.push(content);
    result.push("</blockquote>");
  }

  return result.join("\n");
}
