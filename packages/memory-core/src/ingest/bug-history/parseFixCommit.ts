export type BugCategory = 'spec' | 'logic' | 'regression' | 'typo' | 'deps' | 'unknown';

export interface FixCommitParseResult {
  package: string;
  category: BugCategory;
  subject_summary: string;
}

const CATEGORY = ['spec', 'logic', 'regression', 'typo', 'deps'] as const;
const FIX_RE = /^fix(?:\(([^)/]+)(?:\/([a-zA-Z]+))?\))?:\s*(.+)$/;

export function parseFixCommit(input: { subject: string }): FixCommitParseResult | null {
  const match = FIX_RE.exec(input.subject.trim());
  if (!match) return null;
  const [, pkg, cat, summary] = match;
  const category: BugCategory =
    cat !== undefined && (CATEGORY as readonly string[]).includes(cat)
      ? (cat as BugCategory)
      : 'unknown';
  return {
    package: pkg ?? 'unknown',
    category,
    subject_summary: summary.trim(),
  };
}
