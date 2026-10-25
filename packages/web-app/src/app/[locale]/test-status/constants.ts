import type { MeansState, SortKey, TestRunResult } from '../../../lib/testStatus/types';

/** テスト実施状況では「CI で実行されていない」の強調にだけ使う */
export { ACCENT_AMBER } from '../../../lib/accentColor';

export interface StateMeta {
  readonly label: string;
  /** 色だけで意味を伝えないための記号。アイコン + ラベル + 色の三重表現に使う */
  readonly mark: string;
  readonly color: 'success' | 'warning' | 'error' | 'default';
}

export const MEANS_STATE_META: Readonly<Record<MeansState, StateMeta>> = {
  done: { label: '実施', mark: '●', color: 'success' },
  partial: { label: '一部', mark: '◐', color: 'warning' },
  none: { label: '未実施', mark: '○', color: 'error' },
  na: { label: '対象外', mark: '－', color: 'default' },
};

export const RESULT_META: Readonly<Record<TestRunResult, StateMeta>> = {
  pass: { label: '成功', mark: '●', color: 'success' },
  fail: { label: '失敗', mark: '✕', color: 'error' },
  timeout: { label: '時間切れ', mark: '✕', color: 'error' },
  error: { label: '起動失敗', mark: '✕', color: 'error' },
  'no-tests': { label: 'テストなし', mark: '－', color: 'default' },
  'no-config': { label: '設定なし', mark: '△', color: 'warning' },
};

export interface ColumnMeta {
  readonly key: SortKey;
  readonly label: string;
  readonly numeric: boolean;
}

export const PACKAGE_COLUMNS: readonly ColumnMeta[] = [
  { key: 'package', label: 'パッケージ', numeric: false },
  { key: 'tests', label: 'テスト', numeric: true },
  { key: 'failed', label: '失敗', numeric: true },
  { key: 'skipped', label: 'スキップ', numeric: true },
  { key: 'durationSec', label: '所要秒', numeric: true },
  { key: 'fixes90d', label: '90 日の修正', numeric: true },
  { key: 'coverageNamed', label: 'カバレッジ目的', numeric: true },
  { key: 'weak', label: '弱い検証', numeric: true },
];

const COUNT = new Intl.NumberFormat('ja-JP');
const PERCENT = new Intl.NumberFormat('ja-JP', { style: 'percent', maximumFractionDigits: 1 });
// 表示は日本時間に固定する。閲覧者のタイムゾーンに任せると、SSR とクライアントで文字列がずれる
const DATE_TIME = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatCount(value: number): string {
  return COUNT.format(value);
}

export function formatPercent(ratio: number): string {
  return PERCENT.format(ratio);
}

export function formatRunAt(iso: string): string {
  return `${DATE_TIME.format(new Date(iso))}（日本時間）`;
}
