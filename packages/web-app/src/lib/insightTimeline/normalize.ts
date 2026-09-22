import { compareOrdinal } from '../releaseTimeline/compare';
// 影響度の表記ゆれ（高/中/低 → high/medium/low）はリリース年表と同じレポートの同じ
// 表記を読んでいる。2 つ目の対応表を置くと、片方だけに表記が足されて静かに食い違う
import { normalizeImpact } from '../releaseTimeline/normalize';
import { trimChar } from '../trimChars';
import type {
  InsightCategory,
  InsightEntry,
  InsightImpact,
  InsightSource,
  InsightTheme,
  InsightThemeTrack,
  RawInsight,
} from './types';

/** 生データが型どおりでない状態。黙って捨てず、生成スクリプトを落とすために投げる */
export class InsightSchemaError extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CATEGORIES: readonly InsightCategory[] = [
  'claude-code',
  'tech-trend',
  'vocabulary',
  'ecosystem',
];

/** 影響度の強さ。統合時にどちらを残すかの比較に使う */
const IMPACT_RANK: Readonly<Record<InsightImpact, number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** ASCII スラッグが短すぎて ID の識別子にならない下限 */
const MIN_SLUG_LENGTH = 3;

/**
 * タイトルの短いハッシュ（base36）。
 *
 * 日本語だけのタイトルは ASCII スラッグが空になり、同じ日の知見がすべて同じ ID へ潰れる。
 * 潰れた分は `mergeEntries` が 1 件へ畳むので、エラーにも件数の警告にもならず、ただ
 * 知見が消える。暗号用途ではないので衝突耐性より決定性と短さを採る。
 */
function titleHash(title: string): string {
  let hash = 0;
  for (const char of title) {
    hash = (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * 表示用の安定 ID（React key と DOM アンカー）。
 *
 * Why not: スラッグだけにしない。`title.replace(/[^a-z0-9]+/g, '-')` は非 ASCII を全部
 * 落とすので、日本語タイトルの ID は先頭の英字語だけになる。「CLAUDE.md+スラッシュ
 * コマンドで業務委任を構造化」と「CLAUDE.md には繰り返すミスだけを書け」が同じ日に
 * 出ると、どちらも `2026-04-26-claude-md` になった（実測で 12 ID が 15 件を巻き込んだ）。
 * ハッシュを常に付けて、スラッグは読みやすさのためだけに残す。
 */
export function insightId(date: string, title: string): string {
  const slug = trimChar(title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), '-');
  const hash = titleHash(title);
  return slug.length >= MIN_SLUG_LENGTH ? `${date}-${slug}-${hash}` : `${date}-h${hash}`;
}

/**
 * 統合の判定キー。
 *
 * README と `mergeEntries` が宣言している統合条件は「同じ日・**同じタイトル**」なので、
 * 判定は表示 ID ではなくタイトル全文で行う。NUL 区切りは日付とタイトルの境界が
 * タイトル側の文字と混ざらないようにするため。
 */
function mergeKey(date: string, title: string): string {
  return `${date}\u0000${title}`;
}

function assertValid(source: RawInsight, themeIds: ReadonlySet<string>, index: number): void {
  const where = `raw[${index}] (${source.sourceReport})`;
  if (!ISO_DATE.test(source.date)) {
    throw new InsightSchemaError(`${where}: date が YYYY-MM-DD でない (${source.date})`);
  }
  if (!CATEGORIES.includes(source.category)) {
    throw new InsightSchemaError(`${where}: category が不正 (${source.category})`);
  }
  if (source.title.trim().length === 0) {
    throw new InsightSchemaError(`${where}: title が空`);
  }
  if (source.summary.trim().length === 0) {
    throw new InsightSchemaError(`${where}: summary が空`);
  }
  // テーマが無い知見はどのトラックにも並ばない。画面からは「その知見が無かった」と
  // 区別がつかないので、抽出側へ差し戻す
  if (source.themes.length === 0) {
    throw new InsightSchemaError(`${where}: themes が空 (${source.title})`);
  }
  for (const theme of source.themes) {
    if (!themeIds.has(theme)) {
      throw new InsightSchemaError(`${where}: 辞書に無いテーマ id (${theme})`);
    }
  }
  // 「影響度が書かれていない」(null) と「表記が読めなかった」を分ける。読めない表記を
  // null へ倒すと、画面には「影響度の記載が無い知見」として出て抽出側へ戻らない
  if (source.impact != null && normalizeImpact(source.impact) === null) {
    throw new InsightSchemaError(`${where}: impact が辞書に無い表記 (${source.impact})`);
  }
}

function toEntry(source: RawInsight): InsightEntry {
  const title = source.title.trim();
  return {
    id: insightId(source.date, title),
    date: source.date,
    dateConfidence: source.dateConfidence,
    category: source.category,
    title,
    summary: source.summary.trim(),
    themes: [...source.themes],
    impact: normalizeImpact(source.impact),
    sources: [{ report: source.sourceReport, url: source.sourceUrl ?? null }],
  };
}

function mergeSources(
  a: readonly InsightSource[],
  b: readonly InsightSource[],
): readonly InsightSource[] {
  const seen = new Set(a.map((s) => s.report));
  return [...a, ...b.filter((s) => !seen.has(s.report))];
}

function pickImpact(a: InsightImpact | null, b: InsightImpact | null): InsightImpact | null {
  if (a === null) return b;
  if (b === null) return a;
  return IMPACT_RANK[a] >= IMPACT_RANK[b] ? a : b;
}

/**
 * 同じ日・同じタイトルの 2 件を 1 件へ畳む。
 *
 * Why not: 後勝ちで上書きしない。同じ知見が日次と週次の両方に現れるとき、後から読む
 * ほうは既報の再掲であることが多く、上書きすると先に書かれた詳しい要約と影響度が失われる。
 */
function mergeEntries(a: InsightEntry, b: InsightEntry): InsightEntry {
  const themes = [...a.themes];
  for (const theme of b.themes) {
    if (!themes.includes(theme)) themes.push(theme);
  }
  const preferB = a.dateConfidence !== 'explicit' && b.dateConfidence === 'explicit';
  return {
    ...a,
    dateConfidence: preferB ? b.dateConfidence : a.dateConfidence,
    summary: b.summary.length > a.summary.length ? b.summary : a.summary,
    themes,
    impact: pickImpact(a.impact, b.impact),
    sources: mergeSources(a.sources, b.sources),
  };
}

function compareEntries(a: InsightEntry, b: InsightEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // 序数比較。localeCompare は実行環境のロケールで順序が変わり、生成物が再現しなくなる
  return compareOrdinal(a.id, b.id);
}

/** 同じ日・同じタイトルとして 1 件へ畳まれた観測。件数の差を後から説明するために返す */
export interface MergeDiagnostic {
  readonly id: string;
  readonly title: string;
  readonly reports: readonly string[];
}

export interface NormalizeInsightsResult {
  readonly entries: InsightEntry[];
  readonly merges: readonly MergeDiagnostic[];
}

/**
 * 生データを正規化し、統合の内訳も一緒に返す。
 *
 * 成果物の並びは日付昇順で確定させる。再生成のたびに同じ並びになることが目的で、
 * 読む向き（画面では新しい順）とは別物——向きの決定は buildThemeTracks 側に置く。
 *
 * 統合を診断として持ち上げるのは、`raw N 件 → entry M 件` の差だけでは「再掲を畳んだ」
 * のか「抽出が壊れて消えた」のかを呼び出し側が区別できないため（リリース年表の
 * `normalizeReleasesWithDiagnostics` が日付の矛盾を持ち上げるのと同じ理由）。
 */
export function normalizeInsightsWithDiagnostics(
  sources: readonly RawInsight[],
  themes: readonly InsightTheme[],
): NormalizeInsightsResult {
  const themeIds = new Set(themes.map((t) => t.id));
  const byKey = new Map<string, InsightEntry>();
  const mergedKeys = new Set<string>();
  sources.forEach((source, index) => {
    assertValid(source, themeIds, index);
    const entry = toEntry(source);
    const key = mergeKey(entry.date, entry.title);
    const existing = byKey.get(key);
    if (existing) mergedKeys.add(key);
    byKey.set(key, existing ? mergeEntries(existing, entry) : entry);
  });

  const entries = [...byKey.values()].sort(compareEntries);

  // 別タイトルが同じ表示 ID を持つと、React key が重複し DOM アンカーも競合する。
  // insightId はハッシュ込みなので通常は起きないが、起きたときに黙って壊れるより落とす
  const seenIds = new Map<string, string>();
  for (const entry of entries) {
    const other = seenIds.get(entry.id);
    if (other !== undefined) {
      throw new InsightSchemaError(
        `表示 ID が衝突した (${entry.id}): 「${other}」と「${entry.title}」`,
      );
    }
    seenIds.set(entry.id, entry.title);
  }

  const merges = entries
    .filter((entry) => mergedKeys.has(mergeKey(entry.date, entry.title)))
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      reports: entry.sources.map((s) => s.report),
    }));
  return { entries, merges };
}

export function normalizeInsights(
  sources: readonly RawInsight[],
  themes: readonly InsightTheme[],
): InsightEntry[] {
  return normalizeInsightsWithDiagnostics(sources, themes).entries;
}

/**
 * テーマごとの経緯トラックを組む。件数の多いテーマほど前に置く。
 *
 * テーマ内は**新しい順**（上ほど最近）。リリース年表と同じ向きに揃えてある。
 * 成果物 `insights.json` の並びは昇順のままで、向きを変えるのはここだけ——
 * 生成物は再生成で決まる決定論的なデータで、表示の向きは画面の都合である
 * （リリース年表の `groupByMonthDescending` と同じ切り分け）。
 *
 * 1 件も無いテーマはトラックを作らない。カテゴリで絞ったときに空の見出しだけが
 * 並ぶと、そのテーマに知見が無いのか絞り込みで消えたのかが読み手に判別できない。
 */
export function buildThemeTracks(
  entries: readonly InsightEntry[],
  themes: readonly InsightTheme[],
): InsightThemeTrack[] {
  const byTheme = new Map<string, InsightEntry[]>();
  // Why not: 昇順に積んでから reverse しない。渡された配列が昇順である前提が崩れても
  // 型検査にもテストにも現れず、テーマの中だけ並びが壊れたトラックが出る
  for (const entry of [...entries].sort((a, b) => compareEntries(b, a))) {
    for (const theme of entry.themes) {
      const bucket = byTheme.get(theme);
      if (bucket) bucket.push(entry);
      else byTheme.set(theme, [entry]);
    }
  }
  return themes
    .map((theme) => ({ theme, entries: byTheme.get(theme.id) ?? [] }))
    .filter(({ entries: found }) => found.length > 0)
    .map(({ theme, entries: found }) => ({
      themeId: theme.id,
      label: theme.label,
      description: theme.description,
      entries: found,
      // entries は降順なので、収録範囲の下限は末尾・上限は先頭から取る
      from: found[found.length - 1].date,
      to: found[0].date,
    }))
    .sort((a, b) => b.entries.length - a.entries.length || compareOrdinal(a.themeId, b.themeId));
}

/** カテゴリ別の件数。トラックの上に出す内訳に使う */
export function countByCategory(
  entries: readonly InsightEntry[],
): Readonly<Record<InsightCategory, number>> {
  const counts: Record<InsightCategory, number> = {
    'claude-code': 0,
    'tech-trend': 0,
    vocabulary: 0,
    ecosystem: 0,
  };
  for (const entry of entries) counts[entry.category] += 1;
  return counts;
}
