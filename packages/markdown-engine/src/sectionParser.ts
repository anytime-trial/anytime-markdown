const HEADING_RE = /^(#{1,5}) (.+)$/;

export interface MarkdownSection {
  heading: string | null;
  level: number;
  headingLine: string;
  bodyLines: string[];
  children: MarkdownSection[];
}

export function parseMarkdownSections(text: string): MarkdownSection[] {
  if (text === "") return [];
  const lines = text.split("\n");
  return buildSections(lines, 0, lines.length, 0);
}

function matchHeading(line: string): { level: number; text: string } | null {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  return { level: m[1].length, text: m[2].trim() };
}

function isCodeFence(line: string): boolean {
  return line.startsWith("```");
}

/** lines[start..end) 内で parentLevel より深い最初の見出しレベルを返す。見つからなければ 0 */
function detectSplitLevel(lines: string[], start: number, end: number, parentLevel: number): number {
  let inCodeBlock = false;
  for (let j = start; j < end; j++) {
    if (isCodeFence(lines[j])) inCodeBlock = !inCodeBlock;
    if (inCodeBlock) continue;
    const h = matchHeading(lines[j]);
    if (h && h.level > parentLevel) return h.level;
  }
  return 0;
}

/** 最初の splitLevel 見出しより前の行を収集し、読み進めた位置を返す */
function collectRootBody(
  lines: string[], start: number, end: number, splitLevel: number,
): { rootBodyLines: string[]; nextIndex: number } {
  const rootBodyLines: string[] = [];
  let i = start;
  let inCodeBlock = false;
  while (i < end) {
    if (isCodeFence(lines[i])) inCodeBlock = !inCodeBlock;
    if (!inCodeBlock) {
      const h = matchHeading(lines[i]);
      if (h?.level === splitLevel) break;
    }
    rootBodyLines.push(lines[i]);
    i++;
  }
  return { rootBodyLines, nextIndex: i };
}

/** 現在位置から同レベルの見出しまでスキャンしてセクション終端位置を返す */
function findSectionEnd(lines: string[], start: number, end: number, level: number): number {
  let i = start;
  let inCodeBlock = false;
  while (i < end) {
    if (isCodeFence(lines[i])) inCodeBlock = !inCodeBlock;
    if (!inCodeBlock) {
      const next = matchHeading(lines[i]);
      if (next && next.level <= level) break;
    }
    i++;
  }
  return i;
}

/**
 * lines[start..end) を見出しで分割してセクション配列を返す。
 * parentLevel: 親セクションの見出しレベル（ルート呼び出しは 0）
 */
function buildSections(lines: string[], start: number, end: number, parentLevel: number): MarkdownSection[] {
  const sections: MarkdownSection[] = [];

  const splitLevel = detectSplitLevel(lines, start, end, parentLevel);

  // 見出しが見つからない場合: 全行をルートセクションとして返す
  if (splitLevel === 0) {
    if (start < end) {
      sections.push({
        heading: null, level: 0, headingLine: "",
        bodyLines: lines.slice(start, end), children: [],
      });
    }
    return sections;
  }

  // 最初の見出しより前の行をルートセクションとして収集
  const { rootBodyLines, nextIndex } = collectRootBody(lines, start, end, splitLevel);
  let i = nextIndex;
  if (rootBodyLines.length > 0) {
    sections.push({ heading: null, level: 0, headingLine: "", bodyLines: rootBodyLines, children: [] });
  }

  // splitLevel の見出しでセクション分割
  let inCodeBlock = false;
  while (i < end) {
    if (isCodeFence(lines[i])) inCodeBlock = !inCodeBlock;
    if (inCodeBlock) { i++; continue; }

    const h = matchHeading(lines[i]);
    if (h?.level !== splitLevel) { i++; continue; }

    const headingLine = lines[i];
    const heading = h.text;
    const level = h.level;
    i++;

    const sectionEnd = findSectionEnd(lines, i, end, level);

    // bodyStart〜sectionEnd の範囲でサブ見出しを再帰解析
    const bodyLines: string[] = [];
    const children = extractChildren(lines, i, sectionEnd, level, bodyLines);

    sections.push({ heading, level, headingLine, bodyLines, children });
    i = sectionEnd;
  }

  return sections;
}

// --- セクション LCS マッチング ---

export interface SectionMatch {
  type: "matched" | "left-only" | "right-only";
  left: MarkdownSection | null;
  right: MarkdownSection | null;
}

export function matchSections(
  leftSections: MarkdownSection[],
  rightSections: MarkdownSection[],
): SectionMatch[] {
  const leftHeadings = leftSections.map(s => s.heading ?? "");
  const rightHeadings = rightSections.map(s => s.heading ?? "");
  const lcsIndices = computeStringLCS(leftHeadings, rightHeadings);

  const result: SectionMatch[] = [];
  let li = 0;
  let ri = 0;

  for (const [lIdx, rIdx] of lcsIndices) {
    while (li < lIdx) { result.push({ type: "left-only", left: leftSections[li++], right: null }); }
    while (ri < rIdx) { result.push({ type: "right-only", left: null, right: rightSections[ri++] }); }
    result.push({ type: "matched", left: leftSections[lIdx], right: rightSections[rIdx] });
    li = lIdx + 1;
    ri = rIdx + 1;
  }
  while (li < leftSections.length) { result.push({ type: "left-only", left: leftSections[li++], right: null }); }
  while (ri < rightSections.length) { result.push({ type: "right-only", left: null, right: rightSections[ri++] }); }

  return result;
}

/** 文字列配列の LCS インデックスペアを返す */
function computeStringLCS(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { i--; }
    else { j--; }
  }
  return pairs.reverse();
}

/** サブ見出しより前の行を bodyLines に格納し、サブ見出しを再帰的に解析 */
function extractChildren(
  lines: string[], start: number, end: number, parentLevel: number, bodyLines: string[],
): MarkdownSection[] {
  let i = start;
  let inCodeBlock = false;

  while (i < end) {
    if (isCodeFence(lines[i])) inCodeBlock = !inCodeBlock;
    if (!inCodeBlock) {
      const h = matchHeading(lines[i]);
      if (h && h.level > parentLevel) break;
    }
    bodyLines.push(lines[i]);
    i++;
  }
  if (i >= end) return [];
  return buildSections(lines, i, end, parentLevel);
}
