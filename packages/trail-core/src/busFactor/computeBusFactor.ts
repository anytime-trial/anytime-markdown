import type { BusFactorEntry, ComputeBusFactorOptions, FileAuthorCommitRow } from './types';

const DEFAULT_MIN_COMMITS = 5;

/**
 * 著者名の正規化。前後空白除去 + 小文字化のみ行う。
 * session_commits は git log %an しか保持せず（メールアドレス列が無い）、
 * `taro.yamada` と `Taro Yamada` を同一人物と判定する根拠が無いため名寄せはしない。
 */
export function normalizeAuthor(author: string): string {
  return author.trim().toLowerCase();
}

/** シャノンエントロピー H = -Σ p log p（自然対数） */
function shannonEntropy(counts: readonly number[], total: number): number {
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h;
}

/**
 * 集約単位ごとの属人度（Bus Factor）を算出する（Phase 6 S5-B）。
 *
 * score は主著者のコミット比率（0-1・大きいほど属人化）。実効著者数 exp(H) を併記するのは、
 * 同じ 0.8 でも「2 人中 1 人が 8 割」と「10 人中 1 人が 8 割」でリスクの意味が異なるため。
 * コミット数が minCommits 未満の単位は score を出さない（1 コミットのファイルが自動的に 1.0 になる偽陽性を防ぐ）。
 */
export function computeBusFactor(
  rows: readonly FileAuthorCommitRow[],
  options: ComputeBusFactorOptions = {},
): BusFactorEntry[] {
  const minCommits = options.minCommits ?? DEFAULT_MIN_COMMITS;
  const unitsOf = options.unitsOf ?? ((filePath: string) => [filePath]);

  // 単位 → 著者 → コミット集合。同一コミットが複数セッションに紐づく重複を集合で吸収する。
  const byUnit = new Map<string, Map<string, Set<string>>>();
  for (const row of rows) {
    const author = normalizeAuthor(row.author);
    if (!author) continue; // 取込漏れ行を主著者にしない
    for (const unitId of unitsOf(row.filePath)) {
      let authors = byUnit.get(unitId);
      if (!authors) {
        authors = new Map();
        byUnit.set(unitId, authors);
      }
      let commits = authors.get(author);
      if (!commits) {
        commits = new Set();
        authors.set(author, commits);
      }
      commits.add(row.commitHash);
    }
  }

  const entries: BusFactorEntry[] = [];
  for (const [unitId, authors] of byUnit) {
    const counts: { author: string; count: number }[] = [];
    for (const [author, commits] of authors) {
      counts.push({ author, count: commits.size });
    }
    counts.sort((a, b) => b.count - a.count || a.author.localeCompare(b.author));

    const totalCommits = counts.reduce((sum, c) => sum + c.count, 0);
    if (totalCommits === 0) continue;

    const top = counts[0];
    const topAuthorShare = top.count / totalCommits;
    const effectiveAuthors = Math.exp(
      shannonEntropy(
        counts.map((c) => c.count),
        totalCommits,
      ),
    );

    entries.push({
      unitId,
      totalCommits,
      authorCount: counts.length,
      topAuthor: top.author,
      topAuthorShare,
      effectiveAuthors,
      score: totalCommits >= minCommits ? topAuthorShare : null,
    });
  }

  // 属人度の高い順。score 未判定（null）は末尾へ回す。
  entries.sort((a, b) => {
    if (a.score === null && b.score === null) return b.totalCommits - a.totalCommits;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || b.totalCommits - a.totalCommits || a.unitId.localeCompare(b.unitId);
  });
  return entries;
}
