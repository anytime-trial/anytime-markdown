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

export type KindFilter = ReleaseKind | 'all';

export const KIND_FILTERS: readonly { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'cli', label: 'Claude Code' },
  { value: 'model', label: 'モデル' },
];

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
