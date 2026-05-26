import matter from 'gray-matter';
import {
  type ParsedFinding,
  inferCategory,
  inferSeverity,
  inferSeverityFromHeading,
  extractBacktickPaths,
  splitIntoChapters,
  extractProblemSuggestionPairs,
  extractNumberedFindings,
  extractTargetFromFinding,
} from './findingHelpers';

export type { ParsedFinding };

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
      ? data['severity']
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
    const { category, is_category_inferred } = inferCategory(chapter.heading);
    const bodyBasedSeverity = inferSeverity(chapterBody);
    const headingSeverity = inferSeverityFromHeading(chapter.heading);
    // chapter heading severity (Important/Critical 等) を優先、body admonition で上書き許容
    const severity = bodyBasedSeverity !== 'info' ? bodyBasedSeverity : headingSeverity;

    // Strategy 1: 既存ペア抽出（拡張 marker + bullet 接頭辞対応済み）
    const pairs = extractProblemSuggestionPairs(chapter.lines);
    if (pairs.length > 0) {
      for (const [findingText, suggestionText] of pairs) {
        const localTarget =
          extractTargetFromFinding(chapter.heading + '\n' + findingText + '\n' + suggestionText);
        findings.push({
          finding_index: findingIndex++,
          target_file_path: localTarget ?? allTargetRefs[0] ?? null,
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
      continue;
    }

    // Strategy 2: 番号付き finding（Sample 2/3: 🟡 **N. title** / **N. title**）
    const numbered = extractNumberedFindings(chapter.lines);
    if (numbered.length > 0) {
      for (const nf of numbered) {
        const findingText = nf.title + (nf.finding ? `\n\n${nf.finding}` : '');
        const localTarget = extractTargetFromFinding(findingText + '\n' + nf.suggestion);
        findings.push({
          finding_index: findingIndex++,
          target_file_path: localTarget ?? allTargetRefs[0] ?? null,
          target_symbol: null,
          target_line_start: null,
          target_line_end: null,
          category,
          severity,
          finding_text: findingText,
          suggestion_text: nf.suggestion,
          chapter_path: chapter.heading,
          is_category_inferred,
        });
      }
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
