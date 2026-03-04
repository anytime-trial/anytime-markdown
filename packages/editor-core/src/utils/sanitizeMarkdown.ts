import DOMPurify from "dompurify";
import { preprocessMathBlock, preprocessMathInline } from "./mathHelpers";
import { preprocessAdmonition } from "./admonitionHelpers";
import { preprocessFootnoteRefs } from "./footnoteHelpers";
import { preprocessComments } from "./commentHelpers";

const ALLOWED_TAGS = ["details", "summary", "br", "hr", "sub", "sup", "mark", "kbd", "u"];
const ALLOWED_ATTR = ["open"];

/** 空行保持用の Zero-Width Space マーカー */
export const BLANK_LINE_MARKER = "\u200B";

/**
 * マークダウン文字列をコードブロックの内外に分割する。
 * 正規表現の [\s\S]*? による多項式バックトラック（ReDoS）を回避するため、
 * 位置ベースの線形スキャンで分割する。
 * parts.join("") === md が保証される。
 */
export function splitByCodeBlocks(md: string): string[] {
  const parts: string[] = [];
  const len = md.length;
  let lastEnd = 0;
  let i = 0;

  while (i < len) {
    // 行頭の ``` を探す
    const atLineStart = i === 0 || md[i - 1] === "\n";
    if (atLineStart && i + 2 < len && md[i] === "`" && md[i + 1] === "`" && md[i + 2] === "`") {
      // 開きフェンス行の末尾を探す
      const eol = md.indexOf("\n", i);
      if (eol === -1) { i = len; break; } // 最終行に開きフェンスのみ → コードブロックなし
      // 閉じフェンスを行単位で探す
      let closeStart = -1;
      let k = eol + 1;
      while (k < len) {
        if ((k === 0 || md[k - 1] === "\n") && k + 2 < len && md[k] === "`" && md[k + 1] === "`" && md[k + 2] === "`") {
          // 残りが空白のみか確認
          let m = k + 3;
          while (m < len && md[m] !== "\n") { if (md[m] !== " " && md[m] !== "\t") break; m++; }
          if (m === len || md[m] === "\n") { closeStart = k; break; }
        }
        k = md.indexOf("\n", k);
        if (k === -1) break;
        k++; // 次の行頭へ
      }
      if (closeStart === -1) {
        // 閉じフェンスなし → スキップして次の行へ
        i = eol + 1;
        continue;
      }
      // 閉じフェンス行の末尾（``` + trailing whitespace）
      let closeEnd = closeStart + 3;
      while (closeEnd < len && md[closeEnd] !== "\n" && (md[closeEnd] === " " || md[closeEnd] === "\t")) closeEnd++;
      // コードブロック前のテキストを push
      if (i > lastEnd) parts.push(md.slice(lastEnd, i));
      // コードブロック本体を push
      parts.push(md.slice(i, closeEnd));
      lastEnd = closeEnd;
      i = closeEnd;
    } else {
      // 次の行頭へ移動
      const nl = md.indexOf("\n", i);
      i = nl === -1 ? len : nl + 1;
    }
  }
  if (lastEnd < len) parts.push(md.slice(lastEnd));
  return parts;
}

/**
 * マークダウン文字列中のHTMLをサニタイズする。
 * 許可リスト外のタグは除去し、テキスト内容は保持する。
 * コードブロック（```...```）内はサニタイズ対象外とし、
 * DOMPurify による &gt; 等のエスケープを防ぐ。
 */
export function sanitizeMarkdown(md: string): string {
  // Math 前処理: $$...$$ → ```math, $...$ → <span data-math-inline>
  md = preprocessMathBlock(md);
  md = preprocessMathInline(md);
  // Admonition 前処理: > [!TYPE] → <blockquote data-admonition-type>
  md = preprocessAdmonition(md);
  // 脚注参照前処理: [^id] → <sup data-footnote-ref>
  md = preprocessFootnoteRefs(md);
  // コメント前処理: <!-- comment-start/end/point --> → <span data-comment-id/point>
  md = preprocessComments(md);
  // コードブロック境界で分割し、コードブロック外のみサニタイズ
  const parts = splitByCodeBlocks(md);
  return parts
    .map((part) => {
      if (/^```/.test(part)) return part;
      // DOMPurify は前後の改行を除去するため、退避して復元する
      const leadingNL = part.match(/^\n*/)?.[0] ?? "";
      const trailingNL = part.match(/\n*$/)?.[0] ?? "";
      let inner = part.slice(leadingNL.length, part.length - (trailingNL.length || 0));
      if (!inner) return part;
      // math inline スパンを DOMPurify から保護するため、一時プレースホルダに退避
      // 注意: \x00 (NUL) はブラウザの DOMPurify が HTML 仕様に従い除去するため、
      // Unicode Private Use Area 文字 \uE000 をデリミタとして使用する。
      const mathSpans: string[] = [];
      inner = inner.replace(/<span data-math-inline="[^"]*"><\/span>/g, (m) => {
        mathSpans.push(m);
        return `\uE000MATH${mathSpans.length - 1}\uE000`;
      });
      // 脚注参照 sup を DOMPurify から保護
      const fnSpans: string[] = [];
      inner = inner.replace(/<sup data-footnote-ref="[^"]*">[^<]*<\/sup>/g, (m) => {
        fnSpans.push(m);
        return `\uE000FN${fnSpans.length - 1}\uE000`;
      });
      // admonition blockquote を DOMPurify から保護
      const admBlocks: string[] = [];
      inner = inner.replace(/<blockquote data-admonition-type="[^"]*">[\s\S]*?<\/blockquote>/g, (m) => {
        admBlocks.push(m);
        return `\uE000ADM${admBlocks.length - 1}\uE000`;
      });
      // コメントハイライト span を保護
      const cmtBlocks: string[] = [];
      inner = inner.replace(/<span data-comment-id="[^"]*">[\s\S]*?<\/span>/g, (m) => {
        cmtBlocks.push(m); return `\uE000CMT${cmtBlocks.length - 1}\uE000`;
      });
      // コメントポイント span を保護
      const cmtPoints: string[] = [];
      inner = inner.replace(/<span data-comment-point="[^"]*"><\/span>/g, (m) => {
        cmtPoints.push(m); return `\uE000CMTP${cmtPoints.length - 1}\uE000`;
      });
      // DOMPurify でサニタイズ後、マークダウンで意味を持つ文字の
      // HTMLエンティティを元に戻す
      let sanitized = DOMPurify.sanitize(inner, { ALLOWED_TAGS, ALLOWED_ATTR, KEEP_CONTENT: true })
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
      // math inline スパンを復元
      sanitized = sanitized.replace(/\uE000MATH(\d+)\uE000/g, (_, i) => mathSpans[Number(i)]);
      // admonition blockquote を復元
      sanitized = sanitized.replace(/\uE000ADM(\d+)\uE000/g, (_, i) => admBlocks[Number(i)]);
      // 脚注参照 sup を復元
      sanitized = sanitized.replace(/\uE000FN(\d+)\uE000/g, (_, i) => fnSpans[Number(i)]);
      // コメントポイント span を復元
      sanitized = sanitized.replace(/\uE000CMTP(\d+)\uE000/g, (_, i) => cmtPoints[Number(i)]);
      // コメントハイライト span を復元
      sanitized = sanitized.replace(/\uE000CMT(\d+)\uE000/g, (_, i) => cmtBlocks[Number(i)]);
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
  const parts = splitByCodeBlocks(md);
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
