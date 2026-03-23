import DOMPurify from "dompurify";

import { preprocessAdmonition } from "./admonitionHelpers";
import { preprocessComments } from "./commentHelpers";
import { preprocessFootnoteRefs } from "./footnoteHelpers";
import { preprocessMathBlock } from "./mathHelpers";

const ALLOWED_TAGS = ["br", "hr", "sub", "sup", "mark", "kbd", "u"];
const ALLOWED_ATTR: string[] = [];

/** 空行保持用の Zero-Width Space マーカー */
export const BLANK_LINE_MARKER = "\u200B";

/** ブロック間 tight transition マーカー (ZWNJ) */
export const TIGHT_TRANSITION_MARKER = "\u200C";

const isHeading = (line: string) => /^#{1,6}\s/.test(line);
const isListStart = (line: string) => /^[-*+]\s|^\d+[.)]\s/.test(line);
const isBlockquoteStart = (line: string) => /^>\s?/.test(line);
const isHR = (line: string) => /^(?:---+|___+|\*\*\*+)\s*$/.test(line);
const isIndented = (line: string) => /^[ \t]/.test(line);
const isTableRow = (line: string) => line.trimStart().startsWith("|");
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

/** 同一ブロックの継続行ペアか判定する */
export function isSameBlockContinuation(cur: string, nxt: string): boolean {
  // バックスラッシュ改行（ハードブレイク）は同一ブロックの継続
  if (cur.endsWith("\\")) return true;
  // 同じ blockquote 内
  if (isBlockquoteStart(cur) && isBlockquoteStart(nxt)) return true;
  // 同一リスト内（同種のリストマーカー）
  if (isListStart(cur) && isListStart(nxt)) {
    const curOrd = /^\d+[.)]\s/.test(cur);
    const nxtOrd = /^\d+[.)]\s/.test(nxt);
    if (curOrd === nxtOrd) return true;
  }
  // インデント行は前ブロックの継続
  const curBlockRelated = isBlockStart(cur) || isIndented(cur);
  if (curBlockRelated && isIndented(nxt)) return true;
  return false;
}

/** 行ペアが tight transition（マーカー付与が必要）か判定する */
export function needsTightMark(cur: string, nxt: string): boolean {
  if (isOneLineBlock(cur)) return true;
  if (isBlockStart(nxt)) return true;
  const curBlockRelated = isBlockStart(cur) || isIndented(cur);
  return curBlockRelated && !isBlockStart(nxt) && !isIndented(nxt);
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
    if (isSameBlockContinuation(cur, nxt)) continue;
    if (needsTightMark(cur, nxt)) marked[i] = appendMarker(cur);
  }

  return marked.join("\n");
}

/**
 * 同一段落内の連続プレーンテキスト行にハードブレイク（\）を付加する。
 * CommonMark では連続行は1段落に結合されるが、元の改行を保持するためバックスラッシュを追加する。
 * コードブロック外のテキストに対して markTightBlockTransitions の後に呼び出すこと。
 */
/** ハードブレイク付加をスキップすべき行ペアか判定する */
export function shouldSkipHardBreak(cur: string, nxt: string): boolean {
  // 空行
  if (cur === "" || nxt === "") return true;
  // 既にハードブレイクがある行
  if (cur.endsWith("\\") || cur.endsWith("  ")) return true;
  // tight transition マーカー付きの行（別ブロック遷移として処理済み）
  if (cur.endsWith(TIGHT_TRANSITION_MARKER) || cur.endsWith(" " + TIGHT_TRANSITION_MARKER)) return true;
  // ブロック要素
  if (isHeading(cur) || isHR(cur)) return true;
  if (isListStart(cur) || isListStart(nxt)) return true;
  if (isBlockquoteStart(cur) || isBlockquoteStart(nxt)) return true;
  // マークダウンテーブル行
  if (isTableRow(cur) || isTableRow(nxt)) return true;
  // HTML タグ行
  if (cur.startsWith("<") || nxt.startsWith("<") || cur.startsWith("</") || nxt.startsWith("</")) return true;
  return false;
}

function addHardBreaksToConsecutiveLines(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 2) return text;

  const result = [...lines];
  for (let i = 0; i < lines.length - 1; i++) {
    const cur = lines[i];
    const nxt = lines[i + 1];

    if (shouldSkipHardBreak(cur, nxt)) continue;
    // タブ区切りデータ（スプレッドシートからのコピー等）は <br> を付加
    if (cur.includes("\t") || nxt.includes("\t")) {
      result[i] = cur + "<br>";
      continue;
    }
    if (isBlockStart(nxt)) continue;
    // インデント行（リスト継続等）はスキップ
    if (isIndented(cur) || isIndented(nxt)) continue;

    // 両方がプレーンテキスト → ハードブレイクを付加
    result[i] = cur + "\\";
  }

  return result.join("\n");
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
  return md.replaceAll(/^(\|.+\|)$/gm, (line) => {
    return line.replaceAll(/(?<!`)(`+)(?!`)(.*?)(?<!`)\1(?!`)/g, (m, ticks: string, content: string) => {
      if (!content.includes("|")) return m;
      return ticks + content.replaceAll(/(?<!\\)\|/g, String.raw`\|`) + ticks;
    });
  });
}

/** コードスパン内の閉じバッククォートを探す。見つからなければ -1 を返す */
export function findClosingTicks(text: string, openTicks: string, tickCount: number, from: number): number {
  let searchFrom = from;
  while (searchFrom < text.length) {
    const closePos = text.indexOf(openTicks, searchFrom);
    if (closePos === -1) return -1;
    const before = closePos > 0 ? text[closePos - 1] : "";
    const after = closePos + tickCount < text.length ? text[closePos + tickCount] : "";
    if (before !== "`" && after !== "`") return closePos;
    searchFrom = closePos + 1;
  }
  return -1;
}

/** インラインコードスパンをプレースホルダに退避し、退避リストを返す */
export function protectInlineCodeSpans(text: string): { result: string; codes: string[] } {
  const codes: string[] = [];
  let out = "";
  let j = 0;
  while (j < text.length) {
    if (text[j] !== "`") { out += text[j]; j++; continue; }
    const tickStart = j;
    while (j < text.length && text[j] === "`") j++;
    const tickCount = j - tickStart;
    const openTicks = "`".repeat(tickCount);
    const closePos = findClosingTicks(text, openTicks, tickCount, j);
    if (closePos === -1) { out += openTicks; continue; }
    const fullCode = text.slice(tickStart, closePos + tickCount);
    codes.push(fullCode);
    out += `\uE000IC${codes.length - 1}\uE000`;
    j = closePos + tickCount;
  }
  return { result: out, codes };
}

/** DOMPurify から保護するためにタグをプレースホルダに退避する汎用関数 */
export function protectSpans(text: string, pattern: RegExp, prefix: string): { result: string; spans: string[] } {
  const spans: string[] = [];
  const result = text.replace(pattern, (m) => {
    spans.push(m);
    return `\uE000${prefix}${spans.length - 1}\uE000`;
  });
  return { result, spans };
}

/** プレースホルダを元のスパンに復元する */
export function restoreSpans(text: string, prefix: string, spans: string[]): string {
  return text.replaceAll(new RegExp(`\uE000${prefix}(\\d+)\uE000`, "g"), (_, i) => spans[Number(i)]);
}

/** 行頭が ``` で始まり、残りが空白のみかチェック */
function isClosingFenceLine(md: string, k: number, len: number): boolean {
  if (!((k === 0 || md[k - 1] === "\n") && k + 2 < len && md[k] === "`" && md[k + 1] === "`" && md[k + 2] === "`")) {
    return false;
  }
  let m = k + 3;
  while (m < len && md[m] !== "\n") {
    if (md[m] !== " " && md[m] !== "\t") return false;
    m++;
  }
  return true;
}

/** 閉じフェンス（行頭 ``` + 空白のみ）の開始位置を探す。見つからなければ -1 */
function findClosingFence(md: string, from: number): number {
  const len = md.length;
  let k = from;
  while (k < len) {
    if (isClosingFenceLine(md, k, len)) return k;
    k = md.indexOf("\n", k);
    if (k === -1) break;
    k++;
  }
  return -1;
}

/** 閉じフェンスの末尾位置（trailing whitespace を含む）を返す */
function findFenceEnd(md: string, closeStart: number): number {
  const len = md.length;
  let closeEnd = closeStart + 3;
  while (closeEnd < len && md[closeEnd] !== "\n" && (md[closeEnd] === " " || md[closeEnd] === "\t")) closeEnd++;
  return closeEnd;
}

export function splitByCodeBlocks(md: string): string[] {
  const parts: string[] = [];
  const len = md.length;
  let lastEnd = 0;
  let i = 0;

  while (i < len) {
    const atLineStart = i === 0 || md[i - 1] === "\n";
    const isTripleBacktick = atLineStart && i + 2 < len && md[i] === "`" && md[i + 1] === "`" && md[i + 2] === "`";
    if (!isTripleBacktick) {
      const nl = md.indexOf("\n", i);
      i = nl === -1 ? len : nl + 1;
      continue;
    }
    const eol = md.indexOf("\n", i);
    if (eol === -1) { break; }
    const closeStart = findClosingFence(md, eol + 1);
    if (closeStart === -1) { i = eol + 1; continue; }
    const closeEnd = findFenceEnd(md, closeStart);
    if (i > lastEnd) parts.push(md.slice(lastEnd, i));
    parts.push(md.slice(i, closeEnd));
    lastEnd = closeEnd;
    i = closeEnd;
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
/** 非コード部分をサニタイズする */
function sanitizeNonCodePart(part: string): string {
  // DOMPurify は前後の改行を除去するため、退避して復元する
  let leadingNL = "";
  for (let i = 0; i < part.length && part[i] === "\n"; i++) leadingNL += "\n";
  let trailingNL = "";
  for (let i = part.length - 1; i >= 0 && part[i] === "\n"; i--) trailingNL += "\n";
  let inner = part.slice(leadingNL.length, part.length - (trailingNL.length || 0));
  if (!inner) return part;

  // インラインコードを保護
  const { result: withoutCode, codes: inlineCodes } = protectInlineCodeSpans(inner);
  inner = withoutCode;

  // 各種 HTML スパンをプレースホルダに退避
  const math = protectSpans(inner, /<span data-math-inline="[^"]*"><\/span>/g, "MATH");
  inner = math.result;
  const fn = protectSpans(inner, /<sup data-footnote-ref="[^"]*">[^<]*<\/sup>/g, "FN");
  inner = fn.result;
  const adm = protectSpans(inner, /<blockquote data-admonition-type="[^"]*">[^<]*(?:<(?!\/blockquote>)[^<]*)*<\/blockquote>/g, "ADM");
  inner = adm.result;
  const cmt = protectSpans(inner, /<span data-comment-id="[^"]*">[^<]*(?:<(?!\/span>)[^<]*)*<\/span>/g, "CMT");
  inner = cmt.result;
  const cmtp = protectSpans(inner, /<span data-comment-point="[^"]*"><\/span>/g, "CMTP");
  inner = cmtp.result;

  // DOMPurify でサニタイズ
  let sanitized = DOMPurify.sanitize(inner, { ALLOWED_TAGS, ALLOWED_ATTR, KEEP_CONTENT: true })
    .replaceAll(/&(amp|lt|gt);/g, (m) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">" })[m] ?? m);

  // プレースホルダを復元
  sanitized = restoreSpans(sanitized, "MATH", math.spans);
  sanitized = restoreSpans(sanitized, "ADM", adm.spans);
  sanitized = restoreSpans(sanitized, "FN", fn.spans);
  sanitized = restoreSpans(sanitized, "CMTP", cmtp.spans);
  sanitized = restoreSpans(sanitized, "CMT", cmt.spans);
  sanitized = restoreSpans(sanitized, "IC", inlineCodes);
  return leadingNL + sanitized + trailingNL;
}

export function sanitizeMarkdown(md: string): string {
  md = preprocessMathBlock(md);
  md = preprocessAdmonition(md);
  md = escapeTableCodeSpanPipes(md);
  md = preprocessFootnoteRefs(md);
  md = preprocessComments(md);
  const parts = splitByCodeBlocks(md);
  return parts
    .map((part) => (part.startsWith("```") ? part : sanitizeNonCodePart(part)))
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
    if (part.startsWith("```")) return part;
    // テーブルセル内のバックスラッシュ改行を <br> に変換する。
    // GFM テーブルは \+改行 をセル内改行として扱わないため、
    // <br> に変換して tiptap がセル内改行として認識できるようにする。
    part = part.replaceAll(/^(\|.+)\\\n(?!\|)(.+\|)$/gm, "$1<br>$2");
    // blockquote 内の空行区切り（> のみの行）の後に > ** が続く場合、
    // tiptap-markdown が段落をマージする不具合がある。
    // 空行区切りを二重改行に変換して別ブロックとして解析させ、
    // tiptap が blockquote ノードを結合する挙動を利用して元に戻す。
    part = part.replaceAll(/^(>[ \t]*)\n(> \*\*)/gm, "$1\n\n$2");
    part = markTightBlockTransitions(part);
    part = addHardBreaksToConsecutiveLines(part);
    // Admonition blockquote 間の余分な空行を正規化（シリアライザの出力で \n\n\n になる場合がある）
    part = part.replaceAll(/(<\/blockquote>)\n{3,}/g, "$1\n\n");
    return part.replaceAll(/\n{3,}/g, (match) => {
      const extra = match.length - 2;
      return "\n\n" + `${BLANK_LINE_MARKER}\n\n`.repeat(extra);
    });
  });

  // 2. コードフェンス境界の tight transition
  for (let j = 0; j < processed.length - 1; j++) {
    const cur = processed[j];
    const nxt = processed[j + 1];
    const curIsCode = cur.startsWith("```");
    const nxtIsCode = nxt.startsWith("```");

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
  md = md.replaceAll(/([*_]) \u200C\n\n/g, "$1\n");
  // tight transition（通常）: ZWNJ + \n\n → \n
  md = md.replaceAll("\u200C\n\n", "\n");
  // tight transition（コードフェンス後）: \n\n + ZWNJ → \n
  md = md.replaceAll("\n\n\u200C", "\n");
  // 残存 ZWNJ を除去
  md = md.replaceAll("\u200C", "");
  // ZWSP マーカー除去で元の空行を復元
  return md.replaceAll("\u200B\n", "");
}

/**
 * 1行内のインラインコードスパンのバッククォート区切りを最小限に正規化する。
 * tiptap-markdown シリアライザはテーブルセル内でコンテンツ内のバッククォートを見て
 * 区切り数を増やすが、CommonMark 仕様では同数のバッククォートのみが
 * 閉じ区切りとなるため、より少ない区切りで安全にデリミットできる場合がある。
 */
/** content 内のバッククォート連続長の集合を返す */
function collectTickRuns(content: string): Set<number> {
  const runs = new Set<number>();
  let r = 0;
  for (const ch of content) {
    if (ch === "`") {
      r++;
    } else {
      if (r > 0) { runs.add(r); }
      r = 0;
    }
  }
  if (r > 0) runs.add(r);
  return runs;
}

export function normalizeCodeSpanDelimitersInLine(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") { out += line[i]; i++; continue; }
    const tickStart = i;
    while (i < line.length && line[i] === "`") i++;
    const tickCount = i - tickStart;
    const openTicks = "`".repeat(tickCount);
    const closePos = findClosingTicks(line, openTicks, tickCount, i);
    if (closePos === -1) { out += openTicks; continue; }
    const content = line.slice(i, closePos);
    const runs = collectTickRuns(content);
    let minTicks = 1;
    while (runs.has(minTicks)) minTicks++;
    out += "`".repeat(minTicks) + content + "`".repeat(minTicks);
    i = closePos + tickCount;
  }
  return out;
}
