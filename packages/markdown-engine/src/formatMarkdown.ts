import { escapeTableCodeSpanPipes } from "./sanitizeMarkdown";

/**
 * format_markdown 用の整形エンジン（フレームワーク非依存・純文字列変換）。
 *
 * markdown-check 規約への決定論的整形を行う。`sanitizeMarkdown` とは目的が異なり、
 * ZWSP/ZWNJ・ハードブレーク `\` を **注入しない**（あちらは tiptap ラウンドトリップ用）。
 * フェンスコードブロック内・frontmatter は一切変更しない。冪等（f(f(x)) === f(x)）。
 */

export interface FormatWarning {
  /** ファイル先頭からの 1-based 行番号（frontmatter を含む） */
  line: number;
  rule: string;
  msg: string;
}

export interface FormatResult {
  result: string;
  rulesApplied: Record<string, number>;
  warnings: FormatWarning[];
}

const HEADING = /^#{1,6}\s/;
const LIST = /^(\s*)(?:[-*+]|\d+[.)])\s/;
const TABLE = /^\s*\|/;
const QUOTE = /^\s*>/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const CLOSE_FENCE = /^\s*([`~]{3,})\s*$/;

type GroupKind = "heading" | "list" | "table" | "quote" | "cont" | "para" | "code";

interface TextUnit {
  kind: "text";
  text: string;
  line: number;
  group: GroupKind;
}
interface CodeUnit {
  kind: "code";
  text: string;
  line: number;
  group: "code";
}
interface BlankUnit {
  kind: "blank";
  line: number;
}
type Unit = TextUnit | CodeUnit | BlankUnit;

function emptyCounts(): Record<string, number> {
  return {
    headingBlankLines: 0,
    blockSpacing: 0,
    listIndent: 0,
    trailingWs: 0,
    collapseBlankLines: 0,
    tablePipeEscape: 0,
  };
}

/** frontmatter（先頭 `---` ... `---`）を分離する。無ければ frontLineCount=0。 */
function splitFrontmatter(md: string): { frontmatter: string | null; body: string; frontLineCount: number } {
  if (!md.startsWith("---\n") && md !== "---") return { frontmatter: null, body: md, frontLineCount: 0 };
  const lines = md.split("\n");
  if (lines[0] !== "---") return { frontmatter: null, body: md, frontLineCount: 0 };
  for (let j = 1; j < lines.length; j++) {
    if (lines[j] === "---") {
      const frontmatter = lines.slice(0, j + 1).join("\n");
      const body = lines.slice(j + 1).join("\n");
      return { frontmatter, body, frontLineCount: j + 1 };
    }
  }
  return { frontmatter: null, body: md, frontLineCount: 0 };
}

function classify(line: string): GroupKind {
  if (HEADING.test(line)) return "heading";
  if (/^\s/.test(line)) return "cont";
  if (LIST.test(line)) return "list";
  if (TABLE.test(line)) return "table";
  if (QUOTE.test(line)) return "quote";
  return "para";
}

/** 本文を行単位の Unit 列へトークン化する（フェンスは1 Unit にまとめる）。 */
function tokenize(body: string, lineOffset: number): Unit[] {
  const lines = body.split("\n");
  const units: Unit[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      const markerChar = fence[1][0];
      const markerLen = fence[1].length;
      const block = [line];
      let k = i + 1;
      for (; k < lines.length; k++) {
        block.push(lines[k]);
        const cl = CLOSE_FENCE.exec(lines[k]);
        if (cl && cl[1][0] === markerChar && cl[1].length >= markerLen) break;
      }
      units.push({ kind: "code", text: block.join("\n"), line: i + lineOffset + 1, group: "code" });
      i = k + 1;
      continue;
    }
    if (line.trim() === "") {
      units.push({ kind: "blank", line: i + lineOffset + 1 });
      i++;
      continue;
    }
    units.push({ kind: "text", text: line, line: i + lineOffset + 1, group: classify(line) });
    i++;
  }
  return units;
}

/** テキスト行の自動修正（インデントのタブ→4スペース・行末空白・テーブルパイプ）。 */
function transformTextLine(line: string, counts: Record<string, number>): string {
  let out = line;

  // listIndent: 先頭インデントのタブを 4 スペースへ
  const lead = /^[ \t]*/.exec(out)?.[0] ?? "";
  if (lead.includes("\t")) {
    out = lead.replaceAll("\t", "    ") + out.slice(lead.length);
    counts.listIndent++;
  }

  // trailingWs: 行末空白を除去。ただし 2 スペース以上のハードブレークは 2 に正規化して保持
  if (/[ \t]+$/.test(out)) {
    const hardBreak = / {2,}$/.test(out) && out.trim() !== "";
    const stripped = out.replace(/[ \t]+$/, "");
    const next = hardBreak ? stripped + "  " : stripped;
    if (next !== out) {
      out = next;
      counts.trailingWs++;
    }
  }

  // tablePipeEscape: テーブル行のコードスパン内パイプをエスケープ
  if (TABLE.test(out)) {
    const escaped = escapeTableCodeSpanPipes(out);
    if (escaped !== out) {
      out = escaped;
      counts.tablePipeEscape++;
    }
  }

  return out;
}

const BLOCK_GROUPS = new Set<GroupKind>(["list", "table", "quote"]);

/** 連続する content unit 間に必要な空行数を決める（heading は厳密値で上書き）。 */
function requiredBlanks(prev: TextUnit | CodeUnit, next: TextUnit | CodeUnit, original: number): number {
  if (next.kind === "text" && next.group === "heading") return 2; // 見出しの上: 厳密に 2
  if (prev.kind === "text" && prev.group === "heading") return 1; // 見出しの下: 厳密に 1

  let req = Math.min(original, 2); // collapseBlankLines: 最大 2
  if (prev.group === "cont" || next.group === "cont") return req; // 継続行は触らない

  const aBlock = BLOCK_GROUPS.has(prev.group);
  const bBlock = BLOCK_GROUPS.has(next.group);
  if (aBlock !== bBlock) req = Math.max(req, 1); // ブロックと非ブロックの境界
  else if (aBlock && bBlock && prev.group !== next.group) req = Math.max(req, 1); // list→table 等
  return req;
}

function attributeGap(
  prev: TextUnit | CodeUnit,
  next: TextUnit | CodeUnit,
  req: number,
  original: number,
  counts: Record<string, number>,
): void {
  if (req === original) return;
  const headingInvolved =
    (prev.kind === "text" && prev.group === "heading") || (next.kind === "text" && next.group === "heading");
  if (headingInvolved) counts.headingBlankLines++;
  else if (req > original) counts.blockSpacing++;
  else counts.collapseBlankLines++;
}

function collectWarnings(units: Unit[]): FormatWarning[] {
  const warnings: FormatWarning[] = [];
  const texts = units.filter((u): u is TextUnit => u.kind === "text");
  for (const u of texts) {
    if (u.group === "list" || u.group === "cont") {
      const indent = (/^ */.exec(u.text)?.[0].length ?? 0);
      if (LIST.test(u.text) && indent >= 8) {
        warnings.push({ line: u.line, rule: "nestDepth", msg: "3階層以上の箇条書きネスト" });
      }
    }
  }
  // hardBreakAfterPeriod: 「。」で終わる本文行の直後に別の本文行が続く
  for (let i = 0; i < units.length - 1; i++) {
    const cur = units[i];
    const nxt = units[i + 1];
    if (cur.kind !== "text" || nxt.kind !== "text") continue;
    if (cur.group !== "para" || nxt.group !== "para") continue;
    if (cur.text.replace(/[ \t]+$/, "").endsWith("。")) {
      warnings.push({ line: cur.line, rule: "hardBreakAfterPeriod", msg: "「。」直後に別の本文行が続いています" });
    }
  }
  return warnings;
}

export function formatMarkdown(md: string): FormatResult {
  const counts = emptyCounts();
  const { frontmatter, body, frontLineCount } = splitFrontmatter(md);

  const units = tokenize(body, frontLineCount);
  const warnings = collectWarnings(units);

  // テキスト行を整形（code/blank は不変）
  const transformed: Unit[] = units.map((u) =>
    u.kind === "text" ? { ...u, text: transformTextLine(u.text, counts) } : u,
  );

  // content unit と、その直前の空行数を集計
  const content: (TextUnit | CodeUnit)[] = [];
  const blanksBefore: number[] = [];
  let pendingBlanks = 0;
  for (const u of transformed) {
    if (u.kind === "blank") {
      pendingBlanks++;
      continue;
    }
    content.push(u);
    blanksBefore.push(pendingBlanks);
    pendingBlanks = 0;
  }

  // 先頭の空行を捨てる際の計上
  if (content.length > 0 && blanksBefore[0] > 0) counts.collapseBlankLines++;

  let bodyOut = "";
  for (let i = 0; i < content.length; i++) {
    if (i > 0) {
      const req = requiredBlanks(content[i - 1], content[i], blanksBefore[i]);
      attributeGap(content[i - 1], content[i], req, blanksBefore[i], counts);
      bodyOut += "\n".repeat(req + 1);
    }
    bodyOut += content[i].text;
  }
  if (content.length > 0) bodyOut += "\n";

  let result: string;
  if (frontmatter !== null) {
    result = content.length > 0 ? frontmatter + "\n\n" + bodyOut : frontmatter + "\n";
  } else {
    result = bodyOut;
  }

  return { result, rulesApplied: counts, warnings };
}
