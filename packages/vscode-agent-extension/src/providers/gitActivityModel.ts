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
 * 破壊的のみ・実行者・期間の 3 フィルタを適用する。**スナップショットは絞り込まない。**
 *
 * 事故調査の問いは「この破壊的操作の直前のスナップショットはどれか」であり、
 * 復元の起点が画面から消えるとフィルタが用をなさない。
 */
export function applyFilters(
  entries: readonly TimelineEntry[],
  filters: TimelineFilters,
  nowIso: string,
): readonly TimelineEntry[] {
  const cutoffMs =
    filters.days === null ? null : Date.parse(nowIso) - filters.days * 24 * 60 * 60 * 1000;

  return entries.filter((entry) => {
    // 日時をパースできない行は期間フィルタで判定できない（NaN < cutoff は常に false で素通りする）。
    // 落とさずに常に残す — 壊れた行こそ異常の証跡でありうるため、UNKNOWN_DATE_KEY 側で可視化する。
    const atMs = Date.parse(entry.at);
    if (cutoffMs !== null && !Number.isNaN(atMs) && atMs < cutoffMs) {
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
 * ローカル TZ の日付（YYYY-MM-DD）でグルーピングする（新しい日付が先頭）。
 *
 * 集計境界はローカル TZ（既定 JST）。getTimezoneOffset() は使えない — WSL の Node は
 * system TZ が UTC のため 0 を返し、常に UTC 日付でグルーピングされてしまう。
 * 日時をパースできないエントリは捨てずに UNKNOWN_DATE_KEY へ寄せる（事故調査で行を黙って
 * 落とすと、その行こそが事故の証跡だった場合に取り返しがつかない）。
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
    const dateKey = hasValidDate(entry)
      ? formatter.format(entryDate(entry))
      : UNKNOWN_DATE_KEY;
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
 * 破壊的操作で失われた commit を救出するコマンドを組み立てる。**実行はしない。**
 *
 * `git reset --hard <beforeSha>` を使わない。それ自体が破壊的操作であり、現在の作業ツリーを
 * 巻き込んで、救出しようとして別の作業を失わせる。失われた commit は「それを指す新しいブランチを
 * 作る」ことで、既存の作業に一切触れずに取り戻せる。将来ここを reset へ「簡略化」しないこと。
 */
export function recoveryCommand(row: GitActivityRow): string | null {
  if (!row.destructive || row.beforeSha === null) {
    return null;
  }

  return `git switch -c recover-${row.beforeSha.slice(0, 7)} ${row.beforeSha}`;
}

/** 日時をパースできなかったエントリを寄せるグループ。降順ソートで自然に末尾へ落ちる（'(' < '2'）。 */
export const UNKNOWN_DATE_KEY = '(日時不明)';

function entryDate(entry: TimelineEntry): Date {
  return new Date(entry.at);
}

/**
 * `at` が日時としてパースできるか。
 *
 * 壊れた 1 行でタイムライン全体を落とさないために要る。Intl.DateTimeFormat は Invalid Date を
 * 渡されると RangeError を投げる（実測）ため、無検査で format すると 1 行の破損が getChildren の
 * 例外になり、**ツリーが丸ごと描画されなくなる**。事故調査 UI が事故のときに沈黙する方向の失敗。
 */
function hasValidDate(entry: TimelineEntry): boolean {
  return !Number.isNaN(entryDate(entry).getTime());
}
