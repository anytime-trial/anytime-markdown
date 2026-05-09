// ── Shared types ──────────────────────────────────────────────────────────────

export type ParsedFinding = {
  finding_index: number;
  target_file_path: string | null;
  target_symbol: string | null;
  target_line_start: number | null;
  target_line_end: number | null;
  category: 'design' | 'a11y' | 'security' | 'perf' | 'naming' | 'spec' | 'logic' | 'other';
  severity: 'info' | 'warn' | 'error';
  finding_text: string;
  suggestion_text: string;
  chapter_path: string;
  is_category_inferred: boolean;
};

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Category inference from chapter title.
 * Note: a11y is checked before design so that コントラスト (a11y) takes precedence
 * over カラー (design) when both appear in the same title.
 */
export function inferCategory(
  chapterTitle: string,
): { category: ParsedFinding['category']; is_category_inferred: boolean } {
  if (/アクセシビリティ|aria|コントラスト|キーボード|フォーカス/i.test(chapterTitle)) {
    return { category: 'a11y', is_category_inferred: false };
  }
  if (/カラー|タイポグラフィ|CTA|レイアウト|余白|デザイン/i.test(chapterTitle)) {
    return { category: 'design', is_category_inferred: false };
  }
  if (/XSS|SQL injection|認証|認可|機密情報|セキュリティ/i.test(chapterTitle)) {
    return { category: 'security', is_category_inferred: false };
  }
  if (/パフォーマンス|レンダリング|キャッシュ|バンドルサイズ/i.test(chapterTitle)) {
    return { category: 'perf', is_category_inferred: false };
  }
  if (/命名|スタイル|可読性/i.test(chapterTitle)) {
    return { category: 'naming', is_category_inferred: false };
  }
  if (/仕様|spec|要件/i.test(chapterTitle)) {
    return { category: 'spec', is_category_inferred: false };
  }
  if (/ロジック|条件分岐|Off-by-one|例外/i.test(chapterTitle)) {
    return { category: 'logic', is_category_inferred: false };
  }
  return { category: 'other', is_category_inferred: true };
}

/**
 * Severity inference from chapter body text.
 */
export function inferSeverity(chapterBody: string): ParsedFinding['severity'] {
  if (/^>\s*\[!CAUTION\]|^>\s*\[!WARNING\]/m.test(chapterBody)) {
    return 'error';
  }
  if (/^>\s*\[!IMPORTANT\]|\*\*注意:\*\*/m.test(chapterBody)) {
    return 'warn';
  }
  return 'info';
}

/**
 * Extract backtick-enclosed paths from a line.
 */
export function extractBacktickPaths(line: string): string[] {
  const paths: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}

export type ChapterBlock = {
  heading: string;
  lines: string[];
};

/**
 * Split body lines into chapter blocks keyed by ## / ### headings.
 * Lines before the first heading are collected under a synthetic '' heading.
 */
export function splitIntoChapters(bodyLines: string[]): ChapterBlock[] {
  const chapters: ChapterBlock[] = [];
  let current: ChapterBlock = { heading: '', lines: [] };

  for (const line of bodyLines) {
    const headingMatch = /^#{2,3}\s+(.+)$/.exec(line);
    if (headingMatch) {
      chapters.push(current);
      current = { heading: headingMatch[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  chapters.push(current);
  return chapters;
}

/**
 * Given the lines of a chapter, extract all (problem, suggestion) pairs.
 * Returns an array of [findingText, suggestionText] tuples.
 */
export function extractProblemSuggestionPairs(lines: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];

  // Regex for **問題:** / **問題**: variants (with optional whitespace)
  const isProblemLine = (l: string) => /^\*\*問題[：:]\*\*|\*\*問題\*\*[：:]/i.test(l.trim());
  const isSuggestionLine = (l: string) => /^\*\*提案[：:]\*\*|\*\*提案\*\*[：:]/i.test(l.trim());

  let i = 0;
  while (i < lines.length) {
    if (isProblemLine(lines[i])) {
      // Collect finding_text: lines after problem marker until suggestion or next problem
      const findingLines: string[] = [];
      // The problem marker line itself may have trailing text
      const problemMarkerRest = lines[i].replace(/^\*\*問題[：:]\*\*|\*\*問題\*\*[：:]/, '').trim();
      if (problemMarkerRest) findingLines.push(problemMarkerRest);
      i++;

      while (i < lines.length && !isSuggestionLine(lines[i]) && !isProblemLine(lines[i])) {
        findingLines.push(lines[i]);
        i++;
      }

      const suggestionLines: string[] = [];
      if (i < lines.length && isSuggestionLine(lines[i])) {
        const suggestionMarkerRest = lines[i]
          .replace(/^\*\*提案[：:]\*\*|\*\*提案\*\*[：:]/, '')
          .trim();
        if (suggestionMarkerRest) suggestionLines.push(suggestionMarkerRest);
        i++;

        while (i < lines.length && !isProblemLine(lines[i]) && !isSuggestionLine(lines[i])) {
          suggestionLines.push(lines[i]);
          i++;
        }
      }

      const findingText = findingLines.join('\n').trim();
      const suggestionText = suggestionLines.join('\n').trim();
      pairs.push([findingText, suggestionText]);
    } else {
      i++;
    }
  }

  return pairs;
}
