import insightsJson from '../../../data/insight-timeline/insights.json';
import type { InsightEntry, InsightTheme } from './types';

/**
 * 生成済みの知見データ（`npm run data:insights` の出力）を型付きで公開する。
 *
 * Why not: JSON を各コンポーネントから直接 import しない。resolveJsonModule が推論する
 * リテラル型は全件ぶんの巨大な union になり、`category` や `impact` が宣言済みの union
 * ではなく「出現値の合併」として広がる。境界をここ 1 箇所に閉じ、外へは宣言済みの型だけを出す。
 */
interface InsightDataset {
  readonly generatedBy: string;
  readonly sourceFiles: readonly string[];
  readonly rawCount: number;
  readonly entryCount: number;
  readonly sourceReportCount: number;
  readonly themes: readonly InsightTheme[];
  readonly entries: readonly InsightEntry[];
}

const dataset = insightsJson as unknown as InsightDataset;

export const INSIGHT_ENTRIES: readonly InsightEntry[] = dataset.entries;

export const INSIGHT_THEMES: readonly InsightTheme[] = dataset.themes;

/** 抽出元となった日次・週次レポートの実数（重複を除く） */
export const INSIGHT_SOURCE_REPORT_COUNT: number = dataset.sourceReportCount;

/** 知見が収録している期間（データが空なら null）。entries は日付昇順で確定している */
export const INSIGHT_PERIOD: {
  readonly from: string;
  readonly to: string;
} | null =
  INSIGHT_ENTRIES.length > 0
    ? {
        from: INSIGHT_ENTRIES[0].date,
        to: INSIGHT_ENTRIES[INSIGHT_ENTRIES.length - 1].date,
      }
    : null;
