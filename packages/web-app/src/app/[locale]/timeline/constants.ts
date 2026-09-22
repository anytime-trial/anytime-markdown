import type { InsightCategory } from '../../../lib/insightTimeline/types';
import { compareOrdinal } from '../../../lib/releaseTimeline/compare';
import type {
  MonthlyReleaseCount,
  ReleaseImpact,
  ReleaseKind,
} from '../../../lib/releaseTimeline/types';

/** ブランドの唯一の差し色（design.md §2.1 `--color-accent-amber`）。影響度「高」の強調にだけ使う */
export const ACCENT_AMBER = '#E8A012';

export interface ImpactMeta {
  readonly label: string;
  readonly short: string;
  /** 色だけで意味を伝えないための記号。アイコン + ラベル + 色の三重表現に使う */
  readonly mark: string;
}

export const IMPACT_META: Readonly<Record<ReleaseImpact, ImpactMeta>> = {
  high: { label: '影響度 高', short: '高', mark: '★' },
  medium: { label: '影響度 中', short: '中', mark: '◆' },
  low: { label: '影響度 低', short: '低', mark: '・' },
};

export const KIND_META: Readonly<Record<ReleaseKind, { label: string; short: string }>> = {
  cli: { label: 'Claude Code 本体', short: 'CLI' },
  model: { label: 'Claude モデル', short: 'Model' },
};

/**
 * 画面が今どの中身を出すか。
 *
 * 種別の絞り込みではなく**表示の切り替え**である。`all` はリリースと知見の両方、
 * `cli` / `model` はリリースをその種別で絞ったもの、`insight` は知見だけを出す。
 * 「すべて」が「リリース全種別」を指していた頃の名前（KindFilter）から改名したのは、
 * 知見が加わって「種別」では言い表せなくなったため。
 */
export type TrackFilter = ReleaseKind | 'all' | 'insight';

export const TRACK_FILTERS: readonly { value: TrackFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'cli', label: 'Claude Code' },
  { value: 'model', label: 'モデル' },
  { value: 'insight', label: '知見' },
];

/** 切り替えの結果を支援技術へ伝える文言。画面の中身が丸ごと入れ替わるため、件数とは別に出す */
export const TRACK_ANNOUNCEMENT: Readonly<Record<TrackFilter, string>> = {
  all: 'リリースと知見の両方を表示中',
  cli: 'Claude Code 本体のリリースを表示中',
  model: 'Claude モデルのリリースを表示中',
  insight: '知見の経緯を表示中',
};

const MONTH_LABEL_PATTERN = /^(\d{4})-(\d{2})$/;

/** `2026-04` → `2026年4月`。壊れた入力はそのまま返す（黙って別の月にしない） */
export function formatMonth(month: string): string {
  const matched = MONTH_LABEL_PATTERN.exec(month);
  if (!matched) return month;
  return `${matched[1]}年${Number(matched[2])}月`;
}

const DATE_LABEL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-04-16` → `4/16`。月見出しの下に置くので年は省く */
export function formatDayLabel(date: string): string {
  const matched = DATE_LABEL_PATTERN.exec(date);
  if (!matched) return date;
  return `${Number(matched[2])}/${Number(matched[3])}`;
}

/** `2026-04-16` → `2026年4月16日` */
export function formatFullDate(date: string): string {
  const matched = DATE_LABEL_PATTERN.exec(date);
  if (!matched) return date;
  return `${matched[1]}年${Number(matched[2])}月${Number(matched[3])}日`;
}

/**
 * 先頭月から末尾月までの欠測を 0 件で埋める。
 *
 * `summarizeByMonth` は出現した月しかバケットを作らないため、そのまま等間隔で並べると
 * リリース 0 件の月が軸から消えて前後の月が隣接する。「頻度の推移」を出すグラフで
 * 空白期間が空白として見えないのは誤読を生む（種別で絞ると容易に欠測が出る）。
 */
export function fillMonthGaps(months: readonly MonthlyReleaseCount[]): MonthlyReleaseCount[] {
  if (months.length === 0) return [];
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const sorted = [...byMonth.keys()].sort(compareOrdinal);
  const filled: MonthlyReleaseCount[] = [];
  let [year, month] = sorted[0].split('-').map(Number);
  const [lastYear, lastMonth] = sorted[sorted.length - 1].split('-').map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    filled.push(byMonth.get(key) ?? { month: key, cli: 0, model: 0 });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return filled;
}

// ---------------------------------------------------------------------------
// 知見の経緯トラック
// ---------------------------------------------------------------------------

export const INSIGHT_CATEGORY_META: Readonly<
  Record<InsightCategory, { label: string; description: string }>
> = {
  'claude-code': {
    label: '活用知見',
    description: 'Claude Code の使い方・運用で分かったこと',
  },
  'tech-trend': {
    label: '技術動向',
    description: 'AI・開発手法・ソフトウェア技術の動き',
  },
  vocabulary: {
    label: '新語彙',
    description: 'その日に現れた新しい概念と言葉',
  },
  ecosystem: {
    label: 'エコシステム',
    description: '競合ツール・ローカル LLM・利用モジュールの動向',
  },
};

export type InsightCategoryFilter = InsightCategory | 'all';

export const INSIGHT_CATEGORY_FILTERS: readonly {
  value: InsightCategoryFilter;
  label: string;
}[] = [
  { value: 'all', label: 'すべて' },
  ...(Object.keys(INSIGHT_CATEGORY_META) as InsightCategory[]).map((value) => ({
    value,
    label: INSIGHT_CATEGORY_META[value].label,
  })),
];

/** 既定で開いておくテーマ数。全部閉じていると経緯が 1 つも見えないため 0 にはしない */
export const INSIGHT_DEFAULT_OPEN_TRACKS = 3;

/**
 * 1 トラックが最初に描く件数。
 *
 * 最大のテーマは 160 件を超える。既定開の 3 トラックをそのまま描くと初回表示だけで
 * 400 枚のカードになり、DOM も読み手の視界も破綻する。古い順に頭から出し、続きは
 * 明示操作で伸ばす（経緯の読み方＝古い順に追う、を切らない）
 */
export const INSIGHT_TRACK_PREVIEW_COUNT = 20;

/** `2026-04-16` → `2026/4/16`。テーマ内は年をまたぐので年を省かない */
export function formatCompactDate(date: string): string {
  const matched = DATE_LABEL_PATTERN.exec(date);
  if (!matched) return date;
  return `${matched[1]}/${Number(matched[2])}/${Number(matched[3])}`;
}

/** `2026-05-12` と `2026-08-07` → `2026年5月〜8月`。年をまたぐときは両方に年を付ける */
export function formatSpan(from: string, to: string): string {
  const start = MONTH_LABEL_PATTERN.exec(from.slice(0, 7));
  const end = MONTH_LABEL_PATTERN.exec(to.slice(0, 7));
  if (!start || !end) return `${from}〜${to}`;
  if (start[1] === end[1]) {
    return start[2] === end[2]
      ? `${start[1]}年${Number(start[2])}月`
      : `${start[1]}年${Number(start[2])}月〜${Number(end[2])}月`;
  }
  return `${formatMonth(from.slice(0, 7))}〜${formatMonth(to.slice(0, 7))}`;
}
