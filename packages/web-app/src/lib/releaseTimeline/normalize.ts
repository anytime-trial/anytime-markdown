import type {
  MonthlyReleaseCount,
  RawRelease,
  ReleaseEntry,
  ReleaseImpact,
  ReleaseKind,
  ReleaseSource,
} from './types';

/**
 * 影響度の表記ゆれ表。
 *
 * Why not: オブジェクトリテラルへのブラケット参照にしない。`normalizeImpact('constructor')`
 * が `Object.prototype` のキーを拾って関数を返し、戻り型 `ReleaseImpact | null` を
 * 名乗ったまま下流の `IMPACT_RANK[a]` を undefined にする。Map なら継承キーが無い。
 */
const IMPACT_BY_LABEL = new Map<string, ReleaseImpact>([
  ['高', 'high'],
  ['中', 'medium'],
  ['低', 'low'],
  ['high', 'high'],
  ['medium', 'medium'],
  ['low', 'low'],
]);

/** 影響度の強さ。統合時にどちらを残すかの比較に使う */
const IMPACT_RANK: Readonly<Record<ReleaseImpact, number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** cli の版数（例 2.1.224）。範囲表記の分解と数値ソートの両方で使う */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** 範囲表記の区切り（半角ハイフン・全角ダッシュ）。前後が版数のときだけ範囲とみなす */
const RANGE_SEPARATOR = /[-–—]/;

export function normalizeImpact(value: string | null | undefined): ReleaseImpact | null {
  if (!value) return null;
  const trimmed = value.trim();
  return IMPACT_BY_LABEL.get(trimmed.toLowerCase()) ?? IMPACT_BY_LABEL.get(trimmed) ?? null;
}

export function canonicalVersion(kind: ReleaseKind, version: string): string {
  const trimmed = version.trim();
  if (kind === 'cli') return trimmed.replace(/^v/i, '');

  // モデル ID 表記（claude-opus-5 / opus-5）を表示名へ戻す。系列名が書かれているので
  // これは表記の言い換えであって、情報を足してはいない
  const idMatch = /^(?:claude-)?(opus|sonnet|haiku|fable|mythos)-(.+)$/i.exec(trimmed);
  if (idMatch) {
    const family = idMatch[1];
    return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${idMatch[2]}`;
  }

  // Why not: 裸の数値（"5" / "4.8"）へ既定系列を補って `Opus 5` を作らない。年表には
  // Sonnet・Fable・Mythos が併記されており系列は 1 つではないので、補完は「公開ページに
  // 存在しない製品名を生成する」ことになる。誤りは例外にもテスト失敗にもならず、誰かが
  // 年表を読むまで残る。系列名の欠落は生成スクリプトの検査で落とす（README 参照）
  return trimmed;
}

export function parseVersionRange(version: string): {
  from: string;
  to: string | null;
} {
  const parts = version.split(RANGE_SEPARATOR).map((p) => p.trim());
  if (parts.length === 2 && parts.every((p) => SEMVER_PATTERN.test(p))) {
    return { from: parts[0], to: parts[1] };
  }
  return { from: version.trim(), to: null };
}

export function versionSortKey(version: string): readonly [number, number, number] | null {
  if (!SEMVER_PATTERN.test(version)) return null;
  const [major, minor, patch] = version.split('.').map(Number);
  return [major, minor, patch];
}

export function entryId(kind: ReleaseKind, version: string): string {
  const slug = version
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${kind}-${slug}`;
}

function toEntry(source: RawRelease): ReleaseEntry {
  const canonical = canonicalVersion(source.kind, source.version);
  const { from, to } = parseVersionRange(canonical);
  return {
    // ID は範囲込みの表記から作る。`from` だけにすると、単独の 2.1.150 と週次まとめの
    // 2.1.150–2.1.157 が同じ ID になって片方の記述と日付が消える（実測で発生した）。
    // 両者は別の観測（単発リリースと期間まとめ）なので別エントリのまま残す
    id: entryId(source.kind, canonical),
    kind: source.kind,
    version: from,
    versionTo: to,
    sortKey: versionSortKey(from),
    date: source.date,
    dateConfidence: source.dateConfidence,
    headline: source.headline.trim(),
    highlights: [...(source.highlights ?? [])],
    impact: normalizeImpact(source.impact),
    sources: [{ report: source.sourceReport, url: source.sourceUrl ?? null }],
  };
}

function mergeSources(
  a: readonly ReleaseSource[],
  b: readonly ReleaseSource[],
): readonly ReleaseSource[] {
  const seen = new Set(a.map((s) => s.report));
  return [...a, ...b.filter((s) => !seen.has(s.report))];
}

function pickImpact(a: ReleaseImpact | null, b: ReleaseImpact | null): ReleaseImpact | null {
  if (a === null) return b;
  if (b === null) return a;
  return IMPACT_RANK[a] >= IMPACT_RANK[b] ? a : b;
}

/**
 * 同一バージョンの 2 エントリを 1 件へ畳む。
 *
 * Why not: 後勝ちで単純に上書きしない。同じ版が複数レポートに跨って現れるとき、
 * 後から出てくるのは「既報の再掲」であることが多く、上書きすると先に書かれた
 * 詳しい記述と explicit な日付が失われる。
 */
function mergeEntries(a: ReleaseEntry, b: ReleaseEntry): ReleaseEntry {
  const preferB = a.dateConfidence !== 'explicit' && b.dateConfidence === 'explicit';
  const highlights = [...a.highlights];
  for (const h of b.highlights) {
    if (!highlights.includes(h)) highlights.push(h);
  }
  return {
    ...a,
    versionTo: a.versionTo ?? b.versionTo,
    date: preferB ? b.date : a.date,
    dateConfidence: preferB ? b.dateConfidence : a.dateConfidence,
    headline: b.headline.length > a.headline.length ? b.headline : a.headline,
    highlights,
    impact: pickImpact(a.impact, b.impact),
    sources: mergeSources(a.sources, b.sources),
  };
}

function compareEntries(a: ReleaseEntry, b: ReleaseEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.sortKey && b.sortKey) {
    return (
      a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || a.sortKey[2] - b.sortKey[2]
    );
  }
  if (a.sortKey) return -1;
  if (b.sortKey) return 1;
  // 序数比較。localeCompare は環境のロケール設定で順序が変わり、生成物が再現しなくなる
  return a.version < b.version ? -1 : a.version > b.version ? 1 : 0;
}

/** 同じバージョンについて、複数のレポートが別々のリリース日を明記していた状態 */
export interface DateConflict {
  readonly id: string;
  readonly dates: readonly string[];
}

export interface NormalizeResult {
  readonly entries: ReleaseEntry[];
  readonly dateConflicts: readonly DateConflict[];
}

/**
 * 生データを正規化し、統合時に見つかった矛盾も一緒に返す。
 *
 * 日付が両方 explicit で食い違う場合、`mergeEntries` は先に読んだほうを残す。それ自体は
 * 決めの問題だが、黙って捨てると「そのリリース日だった」ようにしか見えなくなる。
 * スキーマ違反を例外で落とすのと同じ理由で、矛盾は呼び出し側へ持ち上げる。
 */
export function normalizeReleasesWithDiagnostics(sources: readonly RawRelease[]): NormalizeResult {
  const byId = new Map<string, ReleaseEntry>();
  const conflicts = new Map<string, Set<string>>();
  for (const source of sources) {
    const entry = toEntry(source);
    const existing = byId.get(entry.id);
    if (
      existing &&
      existing.dateConfidence === 'explicit' &&
      entry.dateConfidence === 'explicit' &&
      existing.date !== entry.date
    ) {
      const dates = conflicts.get(entry.id) ?? new Set<string>([existing.date]);
      dates.add(entry.date);
      conflicts.set(entry.id, dates);
    }
    byId.set(entry.id, existing ? mergeEntries(existing, entry) : entry);
  }
  return {
    entries: [...byId.values()].sort(compareEntries),
    dateConflicts: [...conflicts.entries()]
      .map(([id, dates]) => ({ id, dates: [...dates].sort() }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}

export function normalizeReleases(sources: readonly RawRelease[]): ReleaseEntry[] {
  return normalizeReleasesWithDiagnostics(sources).entries;
}

export function summarizeByMonth(entries: readonly ReleaseEntry[]): MonthlyReleaseCount[] {
  const counts = new Map<string, { cli: number; model: number }>();
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const bucket = counts.get(month) ?? { cli: 0, model: 0 };
    bucket[entry.kind] += 1;
    counts.set(month, bucket);
  }
  return [...counts.entries()]
    .map(([month, bucket]) => ({ month, cli: bucket.cli, model: bucket.model }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}
