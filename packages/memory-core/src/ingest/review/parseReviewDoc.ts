import matter from 'gray-matter';

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

export type ParsedReviewDoc = {
  frontmatter: {
    type: 'review';
    title: string;
    date: string;
    author?: string;
    excerpt?: string;
    target_refs?: string[];
    reviewer?: string;
    severity?: 'info' | 'warn' | 'error';
  };
  targetRefs: string[];
  findings: ParsedFinding[];
};

// Category inference from chapter title
// Note: a11y is checked before design so that コントラスト (a11y) takes precedence
// over カラー (design) when both appear in the same title.
function inferCategory(
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

// Severity inference from chapter body text
function inferSeverity(chapterBody: string): ParsedFinding['severity'] {
  if (/^>\s*\[!CAUTION\]|^>\s*\[!WARNING\]/m.test(chapterBody)) {
    return 'error';
  }
  if (/^>\s*\[!IMPORTANT\]|\*\*注意:\*\*/m.test(chapterBody)) {
    return 'warn';
  }
  return 'info';
}

// Extract backtick-enclosed paths from a line
function extractBacktickPaths(line: string): string[] {
  const paths: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}

type ChapterBlock = {
  heading: string;
  lines: string[];
};

/**
 * Split body lines into chapter blocks keyed by ## / ### headings.
 * Lines before the first heading are collected under a synthetic '' heading.
 */
function splitIntoChapters(bodyLines: string[]): ChapterBlock[] {
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
function extractProblemSuggestionPairs(lines: string[]): Array<[string, string]> {
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

export function parseReviewDoc(input: {
  rel_path: string;
  content: string;
}): ParsedReviewDoc | null {
  const { content } = input;

  // 1. Parse frontmatter
  let fm: matter.GrayMatterFile<string>;
  try {
    fm = matter(content);
  } catch {
    return null;
  }

  const data = fm.data as Record<string, unknown>;
  if (data['type'] !== 'review') {
    return null;
  }

  const title = typeof data['title'] === 'string' ? data['title'] : '';
  const date = typeof data['date'] === 'string' ? data['date'] : '';
  const author = typeof data['author'] === 'string' ? data['author'] : undefined;
  const excerpt = typeof data['excerpt'] === 'string' ? data['excerpt'] : undefined;
  const reviewer = typeof data['reviewer'] === 'string' ? data['reviewer'] : undefined;
  const fmSeverity =
    data['severity'] === 'info' || data['severity'] === 'warn' || data['severity'] === 'error'
      ? (data['severity'] as 'info' | 'warn' | 'error')
      : undefined;
  const fmTargetRefs = Array.isArray(data['target_refs'])
    ? (data['target_refs'] as unknown[]).filter((x) => typeof x === 'string').map(String)
    : undefined;

  // 2. Extract target refs from body
  const bodyLines = fm.content.split('\n');
  const bodyTargetRefs: string[] = [];

  for (const line of bodyLines) {
    // Match "レビュー対象:" (possibly bold **レビュー対象:**) followed by backtick paths
    if (/レビュー対象/.test(line)) {
      const paths = extractBacktickPaths(line);
      bodyTargetRefs.push(...paths);
    }
  }

  // Merge target refs (frontmatter ∪ body), deduplicate
  const allTargetRefs = Array.from(new Set([...(fmTargetRefs ?? []), ...bodyTargetRefs]));

  // 3. Walk chapters
  const chapters = splitIntoChapters(bodyLines);
  const findings: ParsedFinding[] = [];
  let findingIndex = 0;

  for (const chapter of chapters) {
    if (!chapter.heading) continue; // skip preamble (before first ## heading)

    const chapterBody = chapter.lines.join('\n');
    const pairs = extractProblemSuggestionPairs(chapter.lines);

    if (pairs.length === 0) continue;

    const { category, is_category_inferred } = inferCategory(chapter.heading);
    const severity = inferSeverity(chapterBody);

    for (const [findingText, suggestionText] of pairs) {
      findings.push({
        finding_index: findingIndex++,
        target_file_path: allTargetRefs[0] ?? null,
        target_symbol: null,
        target_line_start: null,
        target_line_end: null,
        category,
        severity,
        finding_text: findingText,
        suggestion_text: suggestionText,
        chapter_path: chapter.heading,
        is_category_inferred,
      });
    }
  }

  return {
    frontmatter: {
      type: 'review',
      title,
      date,
      ...(author !== undefined && { author }),
      ...(excerpt !== undefined && { excerpt }),
      ...(fmTargetRefs !== undefined && { target_refs: fmTargetRefs }),
      ...(reviewer !== undefined && { reviewer }),
      ...(fmSeverity !== undefined && { severity: fmSeverity }),
    },
    targetRefs: allTargetRefs,
    findings,
  };
}
