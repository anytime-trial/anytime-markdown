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
  /** 本文の保存・表示用（先頭 BODY_EXCERPT_MAX 文字）。指摘抽出には全文を使う。 */
  bodyExcerpt: string;
};

/** caravan_reviews.body_excerpt に入れる本文の上限（parseReviewSession と揃える）。 */
const BODY_EXCERPT_MAX = 4096;

/** フロントマターから読み取る値（型が合わないキーは undefined で落とす）。 */
type ReviewDocFrontmatter = ParsedReviewDoc['frontmatter'] & { target_refs?: string[] };

function readFrontmatter(data: Record<string, unknown>): ReviewDocFrontmatter {
  const author = typeof data['author'] === 'string' ? data['author'] : undefined;
  const excerpt = typeof data['excerpt'] === 'string' ? data['excerpt'] : undefined;
  const reviewer = typeof data['reviewer'] === 'string' ? data['reviewer'] : undefined;
  const severity =
    data['severity'] === 'info' || data['severity'] === 'warn' || data['severity'] === 'error'
      ? data['severity']
      : undefined;
  const targetRefs = Array.isArray(data['target_refs'])
    ? data['target_refs'].filter((x): x is string => typeof x === 'string')
    : undefined;

  return {
    type: 'review',
    title: typeof data['title'] === 'string' ? data['title'] : '',
    date: typeof data['date'] === 'string' ? data['date'] : '',
    ...(author !== undefined && { author }),
    ...(excerpt !== undefined && { excerpt }),
    ...(targetRefs !== undefined && { target_refs: targetRefs }),
    ...(reviewer !== undefined && { reviewer }),
    ...(severity !== undefined && { severity }),
  };
}

/** 本文の "レビュー対象:"（`**レビュー対象:**` を含む）行からバッククォート付きパスを拾う。 */
function extractBodyTargetRefs(bodyLines: string[]): string[] {
  const refs: string[] = [];
  for (const line of bodyLines) {
    if (/レビュー対象/.test(line)) {
      refs.push(...extractBacktickPaths(line));
    }
  }
  return refs;
}

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

function buildFinding(
  args: { findingText: string; suggestionText: string; findingIndex: number; defaultTarget: string | null },
  ctx: ChapterContext,
): ParsedFinding {
  // 明示された `- **対象**:` を最優先。次に本文からの推測、最後にレビュー全体の
  // 既定対象。推測を先に置くと、コード例に現れる実在しないパスが明示指定に勝つ。
  const localTarget = resolveFindingTarget({
    ownText: ctx.heading + '\n' + args.findingText + '\n' + args.suggestionText,
    chapterTarget: ctx.chapterTarget,
    chapterFindingCount: ctx.findingCount,
  });
  return {
    finding_index: args.findingIndex,
    target_file_path: localTarget ?? args.defaultTarget,
    target_symbol: null,
    target_line_start: null,
    target_line_end: null,
    category: ctx.category,
    severity: ctx.severity,
    finding_text: args.findingText,
    suggestion_text: args.suggestionText,
    chapter_path: ctx.heading,
    is_category_inferred: ctx.is_category_inferred,
    checklist_ref: ctx.checklistRef,
  };
}

/** チャプター見出しと本文から、finding へ一律に載せる属性を決める。 */
function resolveChapterAttributes(
  heading: string,
  chapterBody: string,
): Omit<ChapterContext, 'findingCount'> {
  const { category, is_category_inferred } = inferCategory(heading);
  const bodyBasedSeverity = inferSeverity(chapterBody);
  const headingSeverity = inferSeverityFromHeading(heading);
  return {
    heading,
    category,
    is_category_inferred,
    // chapter heading severity (Important/Critical 等) を優先、body admonition で上書き許容
    severity: bodyBasedSeverity === 'info' ? headingSeverity : bodyBasedSeverity,
    // 観点キー（severity と同じ chapter 粒度。マーカー無しは null＝未記録）
    checklistRef: parseChecklistRefMarker(chapterBody),
    chapterTarget: parseTargetMarker(chapterBody),
  };
}

/** チャプター 1 つから finding を抜き出す。テキストのペアは 2 系統の書式に対応する。 */
function extractChapterFindings(
  chapter: ReturnType<typeof splitIntoChapters>[number],
  args: { firstFindingIndex: number; defaultTarget: string | null },
): ParsedFinding[] {
  const attributes = resolveChapterAttributes(chapter.heading, chapter.lines.join('\n'));

  // Strategy 1: 既存ペア抽出（拡張 marker + bullet 接頭辞対応済み）
  const pairs = extractProblemSuggestionPairs(chapter.lines);
  if (pairs.length > 0) {
    const ctx: ChapterContext = { ...attributes, findingCount: pairs.length };
    return pairs.map(([findingText, suggestionText], i) =>
      buildFinding(
        { findingText, suggestionText, findingIndex: args.firstFindingIndex + i, defaultTarget: args.defaultTarget },
        ctx,
      ),
    );
  }

  // Strategy 2: 番号付き finding（Sample 2/3: 🟡 **N. title** / **N. title**）
  const numbered = extractNumberedFindings(chapter.lines);
  const ctx: ChapterContext = { ...attributes, findingCount: numbered.length };
  return numbered.map((nf, i) =>
    buildFinding(
      {
        findingText: nf.title + (nf.finding ? `\n\n${nf.finding}` : ''),
        suggestionText: nf.suggestion,
        findingIndex: args.firstFindingIndex + i,
        defaultTarget: args.defaultTarget,
      },
      ctx,
    ),
  );
}

export function parseReviewDoc(input: {
  rel_path: string;
  content: string;
}): ParsedReviewDoc | null {
  // 1. Parse frontmatter
  let fm: matter.GrayMatterFile<string>;
  try {
    fm = matter(input.content);
  } catch {
    return null;
  }

  const data = fm.data as Record<string, unknown>;
  if (data['type'] !== 'review') {
    return null;
  }
  const frontmatter = readFrontmatter(data);

  // 2. Extract target refs from body（frontmatter ∪ body、重複除去）
  const bodyLines = fm.content.split('\n');
  const allTargetRefs = Array.from(
    new Set([...(frontmatter.target_refs ?? []), ...extractBodyTargetRefs(bodyLines)]),
  );
  const defaultTarget = allTargetRefs[0] ?? null;

  // 3. Walk chapters
  const findings: ParsedFinding[] = [];
  for (const chapter of splitIntoChapters(bodyLines)) {
    if (!chapter.heading) continue; // skip preamble (before first ## heading)
    findings.push(
      ...extractChapterFindings(chapter, { firstFindingIndex: findings.length, defaultTarget }),
    );
  }

  return {
    frontmatter,
    targetRefs: allTargetRefs,
    findings,
    bodyExcerpt:
      fm.content.length > BODY_EXCERPT_MAX ? fm.content.slice(0, BODY_EXCERPT_MAX) : fm.content,
  };
}
