import DOMPurify from "dompurify";

import { preprocessAdmonition } from "./admonitionHelpers";
import { preprocessComments } from "./commentHelpers";
import { preprocessFootnoteRefs } from "./footnoteHelpers";
import { preprocessMathBlock, preprocessMathInline } from "./mathHelpers";

const ALLOWED_TAGS = ["details", "summary", "br", "hr", "sub", "sup", "mark", "kbd", "u"];
const ALLOWED_ATTR = ["open"];

/** 空行保持用の Zero-Width Space マーカー */
export const BLANK_LINE_MARKER = "\u200B";

/** ブロック間 tight transition マーカー (ZWNJ) */
export const TIGHT_TRANSITION_MARKER = "\u200C";

const isHeading = (line: string) => /^#{1,6}\s/.test(line);
const isListStart = (line: string) => /^[-*+]\s|^\d+[.)]\s/.test(line);
const isBlockquoteStart = (line: string) => /^>\s?/.test(line);
const isHR = (line: string) => /^(?:---+|___+|\*\*\*+)\s*$/.test(line);
const isIndented = (line: string) => /^[ \t]/.test(line);
/** 新しいブロックを開始する行か */
const isBlockStart = (line: string) =>
  isHeading(line) || isListStart(line) || isBlockquoteStart(line) || isHR(line);
/** 1行で完結するブロックか（見出し・水平線） */
const isOneLineBlock = (line: string) => isHeading(line) || isHR(line);

/** ZWNJ を行末に付与する（強調末尾はスペースを挟む） */
function appendMarker(line: string): string {
  if (/[*_]$/.test(line)) return line + " " + TIGHT_TRANSITION_MARKER;
  return line + TIGHT_TRANSITION_MARKER;
}

/**
 * ブロック間の tight transition（空行なし）を ZWNJ マーカーで記録する。
 * ProseMirror はブロック間を \n\n に正規化するため、元の \n を保持するために使用。
 * コードブロック外のテキストに対して呼び出すこと。
 */
function markTightBlockTransitions(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 2) return text;

  const marked = [...lines];

  for (let i = 0; i < lines.length - 1; i++) {
    const cur = lines[i];
    const nxt = lines[i + 1];

    if (cur === "" || nxt === "") continue;
    // バックスラッシュ改行（ハードブレイク）は同一ブロックの継続
    if (cur.endsWith("\\")) continue;

    // 同一ブロックの継続をスキップ
    // - 同じ blockquote 内
    if (isBlockquoteStart(cur) && isBlockquoteStart(nxt)) continue;
    // - 同一リスト内（同種のリストマーカー）
    if (isListStart(cur) && isListStart(nxt)) {
      const curOrd = /^\d+[.)]\s/.test(cur);
      const nxtOrd = /^\d+[.)]\s/.test(nxt);
      if (curOrd === nxtOrd) continue;
    }
    // - インデント行は前ブロックの継続
    const curBlockRelated = isBlockStart(cur) || isIndented(cur);
    if (curBlockRelated && isIndented(nxt)) continue;

    let needsMark = false;
    // 1行完結ブロック（見出し・HR）→ 次は必ず別ブロック
    if (isOneLineBlock(cur)) needsMark = true;
    // 次行がブロック開始
    else if (isBlockStart(nxt)) needsMark = true;
    // ブロック関連行 → 通常テキスト（ブロック脱出）
    else if (curBlockRelated && !isBlockStart(nxt) && !isIndented(nxt))
      needsMark = true;

    if (needsMark) marked[i] = appendMarker(cur);
  }

  return marked.join("\n");
}

/**
 * マークダウン文字列をコードブロックの内外に分割する。
 * 正規表現の [\s\S]*? による多項式バックトラック（ReDoS）を回避するため、
 * 位置ベースの線形スキャンで分割する。
 * parts.join("") === md が保証される。
 */
/**
 * テーブル行内のコードスパンに含まれるパイプ `|` を `&#124;` にエスケープする。
 * tiptap-markdown がコードスパン認識前にパイプでセル分割するのを防ぐ。
 */
function escapeTableCodeSpanPipes(md: string): string {
  return md.replace(/^(\|.+\|)$/gm, (line) => {
    // コードスパンを検出し、その中のエスケープされていないパイプを \| でエスケープ
    // markdown-it テーブルパーサーが \| をエスケープ済みパイプとして処理し、
    // コードスパンのパースでは \ が消費されて | のみが残る
    return line.replace(/(?<!`)(`+)(?!`)(.*?)(?<!`)\1(?!`)/g, (m, ticks: string, content: string) => {
      if (!content.includes("|")) return m;
      return ticks + content.replace(/(?<!\\)\|/g, "\\|") + ticks;
    });
  });
}

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
  // テーブル行内コードスパンのパイプをエスケープ（セル区切りとの誤認防止）
  md = escapeTableCodeSpanPipes(md);
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
      // インラインコード（任意長バッククォートのコードスパン）を DOMPurify から保護
      // 注意: \x00 (NUL) はブラウザの DOMPurify が HTML 仕様に従い除去するため、
      // Unicode Private Use Area 文字 \uE000 をデリミタとして使用する。
      // CommonMark 仕様: コードスパンは同数のバッククォートで開閉する（1〜N個）
      const inlineCodes: string[] = [];
      {
        let out = "";
        let j = 0;
        while (j < inner.length) {
          if (inner[j] === "`") {
            const tickStart = j;
            while (j < inner.length && inner[j] === "`") j++;
            const tickCount = j - tickStart;
            const openTicks = "`".repeat(tickCount);
            let found = false;
            let searchFrom = j;
            while (searchFrom < inner.length) {
              const closePos = inner.indexOf(openTicks, searchFrom);
              if (closePos === -1) break;
              const before = closePos > 0 ? inner[closePos - 1] : "";
              const after = closePos + tickCount < inner.length ? inner[closePos + tickCount] : "";
              if (before !== "`" && after !== "`") {
                const fullCode = inner.slice(tickStart, closePos + tickCount);
                inlineCodes.push(fullCode);
                out += `\uE000IC${inlineCodes.length - 1}\uE000`;
                j = closePos + tickCount;
                found = true;
                break;
              }
              searchFrom = closePos + 1;
            }
            if (!found) out += openTicks;
          } else {
            out += inner[j];
            j++;
          }
        }
        inner = out;
      }
      // math inline スパンを DOMPurify から保護するため、一時プレースホルダに退避
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
      inner = inner.replace(/<blockquote data-admonition-type="[^"]*">[^<]*(?:<(?!\/blockquote>)[^<]*)*<\/blockquote>/g, (m) => {
        admBlocks.push(m);
        return `\uE000ADM${admBlocks.length - 1}\uE000`;
      });
      // コメントハイライト span を保護
      const cmtBlocks: string[] = [];
      inner = inner.replace(/<span data-comment-id="[^"]*">[^<]*(?:<(?!\/span>)[^<]*)*<\/span>/g, (m) => {
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
        .replace(/&(amp|lt|gt);/g, (m) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">" })[m] ?? m);
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
      // インラインコードを復元（プレースホルダーから元のコードに戻す）
      // DOMPurify はプレースホルダーしか見ないため、コード内の HTML は変更されない
      sanitized = sanitized.replace(/\uE000IC(\d+)\uE000/g, (_, i) => inlineCodes[Number(i)]);
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
  // NOTE: ProseMirror はブロック間を \n\n に正規化し、
  // 連続段落行をソフトブレーク（スペース結合）にする。これは仕様として許容する。

  // 1. 非コード部分: tight transition マーキング + ZWSP 処理
  const processed = parts.map((part) => {
    if (/^```/.test(part)) return part;
    // テーブルセル内のバックスラッシュ改行を <br> に変換する。
    // GFM テーブルは \+改行 をセル内改行として扱わないため、
    // <br> に変換して tiptap がセル内改行として認識できるようにする。
    part = part.replace(/^(\|.+)\\\n(?!\|)(.+\|)$/gm, "$1<br>$2");
    // blockquote 内の空行区切り（> のみの行）の後に > ** が続く場合、
    // tiptap-markdown が段落をマージする不具合がある。
    // 空行区切りを二重改行に変換して別ブロックとして解析させ、
    // tiptap が blockquote ノードを結合する挙動を利用して元に戻す。
    part = part.replace(/^(>[ \t]*)\n(> \*\*)/gm, "$1\n\n$2");
    part = markTightBlockTransitions(part);
    return part.replace(/\n{3,}/g, (match) => {
      const extra = match.length - 2;
      return "\n\n" + `${BLANK_LINE_MARKER}\n\n`.repeat(extra);
    });
  });

  // 2. コードフェンス境界の tight transition
  for (let j = 0; j < processed.length - 1; j++) {
    const cur = processed[j];
    const nxt = processed[j + 1];
    const curIsCode = /^```/.test(cur);
    const nxtIsCode = /^```/.test(nxt);

    // 非コード → コード: フェンス前が \n（空行なし）ならマーク
    if (!curIsCode && nxtIsCode && cur.endsWith("\n") && !cur.endsWith("\n\n")) {
      const trimmed = cur.slice(0, -1);
      const lastLine = trimmed.slice(trimmed.lastIndexOf("\n") + 1);
      if (lastLine !== "") {
        processed[j] = trimmed.slice(0, -lastLine.length) + appendMarker(lastLine) + "\n";
      }
    }
    // コード → 非コード: フェンス後が \n（空行なし）かつ実コンテンツありならマーク
    if (curIsCode && !nxtIsCode && nxt.startsWith("\n") && !nxt.startsWith("\n\n")) {
      const afterNl = nxt.slice(1);
      if (afterNl.trim() !== "") {
        processed[j + 1] = "\n" + TIGHT_TRANSITION_MARKER + afterNl;
      }
    }
  }

  return processed.join("");
}

/**
 * シリアライズされたマークダウンから ZWSP マーカーを除去し、
 * 元の空行を復元する。
 */
export function restoreBlankLines(md: string): string {
  // tight transition（強調末尾）: *|_ + space + ZWNJ + \n\n → *|_ + \n
  md = md.replace(/([*_]) \u200C\n\n/g, "$1\n");
  // tight transition（通常）: ZWNJ + \n\n → \n
  md = md.replace(/\u200C\n\n/g, "\n");
  // tight transition（コードフェンス後）: \n\n + ZWNJ → \n
  md = md.replace(/\n\n\u200C/g, "\n");
  // 残存 ZWNJ を除去
  md = md.replace(/\u200C/g, "");
  // ZWSP マーカー除去で元の空行を復元
  return md.replace(/\u200B\n/g, "");
}

/**
 * 1行内のインラインコードスパンのバッククォート区切りを最小限に正規化する。
 * tiptap-markdown シリアライザはテーブルセル内でコンテンツ内のバッククォートを見て
 * 区切り数を増やすが、CommonMark 仕様では同数のバッククォートのみが
 * 閉じ区切りとなるため、より少ない区切りで安全にデリミットできる場合がある。
 */
export function normalizeCodeSpanDelimitersInLine(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] === "`") {
      const tickStart = i;
      while (i < line.length && line[i] === "`") i++;
      const tickCount = i - tickStart;
      const openTicks = "`".repeat(tickCount);

      // 閉じ区切り（同数のバッククォート）を探す
      let found = false;
      let searchFrom = i;
      while (searchFrom < line.length) {
        const closePos = line.indexOf(openTicks, searchFrom);
        if (closePos === -1) break;
        const before = closePos > 0 ? line[closePos - 1] : "";
        const after = closePos + tickCount < line.length ? line[closePos + tickCount] : "";
        if (before !== "`" && after !== "`") {
          const content = line.slice(i, closePos);
          // content 内のバッククォート連続長を集める
          const runs = new Set<number>();
          let r = 0;
          for (let c = 0; c < content.length; c++) {
            if (content[c] === "`") { r++; }
            else { if (r > 0) runs.add(r); r = 0; }
          }
          if (r > 0) runs.add(r);
          // 最小の安全な区切り数を求める（runs に含まれない最小正整数）
          let minTicks = 1;
          while (runs.has(minTicks)) minTicks++;

          out += "`".repeat(minTicks) + content + "`".repeat(minTicks);
          i = closePos + tickCount;
          found = true;
          break;
        }
        searchFrom = closePos + 1;
      }
      if (!found) {
        out += openTicks;
      }
    } else {
      out += line[i];
      i++;
    }
  }
  return out;
}
