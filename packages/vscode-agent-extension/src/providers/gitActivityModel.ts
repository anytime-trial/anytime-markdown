import type { GitActivityRow, GitAttribution, WorkSnapshot } from '@anytime-markdown/agent-core';

/**
 * Git activity and work snapshot entry for the recovery timeline.
 */
export type TimelineEntry =
  | { readonly kind: 'git'; readonly at: string; readonly row: GitActivityRow }
  | { readonly kind: 'snapshot'; readonly at: string; readonly snapshot: WorkSnapshot };

/**
 * Filters applied to a recovery timeline.
 */
export interface TimelineFilters {
  readonly destructiveOnly: boolean;
  readonly attribution: GitAttribution | 'all';
  readonly days: number | null;
}

/**
 * Timeline entries grouped by local calendar date.
 */
export interface TimelineDateGroup {
  readonly dateKey: string;
  readonly entries: readonly TimelineEntry[];
}

/**
 * Merge git activity and work snapshots into a newest-first timeline.
 */
export function buildTimeline(
  rows: readonly GitActivityRow[],
  snapshots: readonly WorkSnapshot[],
): readonly TimelineEntry[] {
  const gitEntries: TimelineEntry[] = rows.map((row) => ({
    kind: 'git',
    at: row.occurredAt,
    row,
  }));
  const snapshotEntries: TimelineEntry[] = snapshots.map((snapshot) => ({
    kind: 'snapshot',
    at: snapshot.createdAt,
    snapshot,
  }));

  return [...gitEntries, ...snapshotEntries].sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Apply destructive, attribution, and age filters while preserving snapshots for recovery context.
 */
export function applyFilters(
  entries: readonly TimelineEntry[],
  filters: TimelineFilters,
  nowIso: string,
): readonly TimelineEntry[] {
  const cutoffMs =
    filters.days === null ? null : Date.parse(nowIso) - filters.days * 24 * 60 * 60 * 1000;

  return entries.filter((entry) => {
    if (cutoffMs !== null && Date.parse(entry.at) < cutoffMs) {
      return false;
    }

    if (entry.kind === 'snapshot') {
      return true;
    }

    if (filters.destructiveOnly && !entry.row.destructive) {
      return false;
    }

    if (filters.attribution !== 'all' && entry.row.attribution !== filters.attribution) {
      return false;
    }

    return true;
  });
}

/**
 * Group timeline entries by local YYYY-MM-DD date in the requested IANA time zone.
 */
export function groupByLocalDate(
  entries: readonly TimelineEntry[],
  timeZone: string,
): readonly TimelineDateGroup[] {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const groups = new Map<string, TimelineEntry[]>();

  for (const entry of entries) {
    const dateKey = formatter.format(entryDate(entry));
    const group = groups.get(dateKey);
    if (group) {
      group.push(entry);
    } else {
      groups.set(dateKey, [entry]);
    }
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([dateKey, groupEntries]) => ({
      dateKey,
      entries: groupEntries,
    }));
}

/**
 * Return a non-destructive branch command for recovering the pre-operation commit.
 */
export function recoveryCommand(row: GitActivityRow): string | null {
  if (!row.destructive || row.beforeSha === null) {
    return null;
  }

  return `git switch -c recover-${row.beforeSha.slice(0, 7)} ${row.beforeSha}`;
}

function entryDate(entry: TimelineEntry): Date {
  return new Date(entry.at);
}
