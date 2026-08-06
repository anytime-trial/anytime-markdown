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
  parseTargetMarker,
  resolveFindingTarget,
  parseChecklistRefMarker,
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

  const defaultTarget = allTargetRefs[0] ?? null;

  /** チャプター単位で決まる属性。finding ごとに変わらないものをまとめて渡す。 */
  type ChapterContext = {
    readonly heading: string;
    readonly category: ParsedFinding['category'];
    readonly severity: ParsedFinding['severity'];
    readonly is_category_inferred: boolean;
    readonly checklistRef: string | null;
    /** チャプター全体から取れた `- **対象**:`。 */
    readonly chapterTarget: string | null;
    /** このチャプターが生む finding の件数（対象マーカーの流用可否を決める）。 */
    readonly findingCount: number;
  };

  function pushFinding(findingText: string, suggestionText: string, ctx: ChapterContext): void {
    // 明示された `- **対象**:` を最優先。次に本文からの推測、最後にレビュー全体の
    // 既定対象。推測を先に置くと、コード例に現れる実在しないパスが明示指定に勝つ。
    const localTarget = resolveFindingTarget({
      ownText: ctx.heading + '\n' + findingText + '\n' + suggestionText,
      chapterTarget: ctx.chapterTarget,
      chapterFindingCount: ctx.findingCount,
    });
    findings.push({
      finding_index: findingIndex++,
      target_file_path: localTarget ?? defaultTarget,
      target_symbol: null,
      target_line_start: null,
      target_line_end: null,
      category: ctx.category,
      severity: ctx.severity,
      finding_text: findingText,
      suggestion_text: suggestionText,
      chapter_path: ctx.heading,
      is_category_inferred: ctx.is_category_inferred,
      checklist_ref: ctx.checklistRef,
    });
  }

  for (const chapter of chapters) {
    if (!chapter.heading) continue; // skip preamble (before first ## heading)

    const chapterBody = chapter.lines.join('\n');
    const { category, is_category_inferred } = inferCategory(chapter.heading);
    const bodyBasedSeverity = inferSeverity(chapterBody);
    const headingSeverity = inferSeverityFromHeading(chapter.heading);
    // chapter heading severity (Important/Critical 等) を優先、body admonition で上書き許容
    const severity = bodyBasedSeverity === 'info' ? headingSeverity : bodyBasedSeverity;
    // 観点キー（severity と同じ chapter 粒度。マーカー無しは null＝未記録）
    const checklistRef = parseChecklistRefMarker(chapterBody);
    const chapterTarget = parseTargetMarker(chapterBody);

    // Strategy 1: 既存ペア抽出（拡張 marker + bullet 接頭辞対応済み）
    const pairs = extractProblemSuggestionPairs(chapter.lines);
    if (pairs.length > 0) {
      const ctx: ChapterContext = {
        heading: chapter.heading, category, severity, is_category_inferred,
        checklistRef, chapterTarget, findingCount: pairs.length,
      };
      for (const [findingText, suggestionText] of pairs) {
        pushFinding(findingText, suggestionText, ctx);
      }
      continue;
    }

    // Strategy 2: 番号付き finding（Sample 2/3: 🟡 **N. title** / **N. title**）
    const numbered = extractNumberedFindings(chapter.lines);
    const ctx: ChapterContext = {
      heading: chapter.heading, category, severity, is_category_inferred,
      checklistRef, chapterTarget, findingCount: numbered.length,
    };
    for (const nf of numbered) {
      const findingText = nf.title + (nf.finding ? `\n\n${nf.finding}` : '');
      pushFinding(findingText, nf.suggestion, ctx);
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
