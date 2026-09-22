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
    hash = (Math.imul(hash, 31) + char.codePointAt(0)!) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function insightId(date: string, title: string): string {
  const slug = trimChar(title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), '-');
  return slug.length >= MIN_SLUG_LENGTH ? `${date}-${slug}` : `${date}-h${titleHash(title)}`;
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

/**
 * 生データを正規化して日付昇順のエントリ列にする。
 *
 * 経緯は古い順でないと変遷として読めないので、成果物そのものを昇順で確定させる
 * （表示の向きは画面の都合だが、こちらは「変遷」という意味の向きである）。
 */
export function normalizeInsights(
  sources: readonly RawInsight[],
  themes: readonly InsightTheme[],
): InsightEntry[] {
  const themeIds = new Set(themes.map((t) => t.id));
  const byId = new Map<string, InsightEntry>();
  sources.forEach((source, index) => {
    assertValid(source, themeIds, index);
    const entry = toEntry(source);
    const existing = byId.get(entry.id);
    byId.set(entry.id, existing ? mergeEntries(existing, entry) : entry);
  });
  return [...byId.values()].sort(compareEntries);
}

/**
 * テーマごとの経緯トラックを組む。件数の多いテーマほど前に置く。
 *
 * 1 件も無いテーマはトラックを作らない。カテゴリで絞ったときに空の見出しだけが
 * 並ぶと、そのテーマに知見が無いのか絞り込みで消えたのかが読み手に判別できない。
 */
export function buildThemeTracks(
  entries: readonly InsightEntry[],
  themes: readonly InsightTheme[],
): InsightThemeTrack[] {
  const byTheme = new Map<string, InsightEntry[]>();
  for (const entry of [...entries].sort(compareEntries)) {
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
      from: found[0].date,
      to: found[found.length - 1].date,
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
