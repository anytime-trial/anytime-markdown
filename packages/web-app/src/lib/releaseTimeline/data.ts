import releasesJson from '../../../data/claude-code-releases/releases.json';
import { summarizeByMonth } from './normalize';
import type { MonthlyReleaseCount, ReleaseEntry } from './types';

/**
 * 生成済みの年表データ（`npm run data:releases` の出力）を型付きで公開する。
 *
 * Why not: JSON を各コンポーネントから直接 import しない。resolveJsonModule が推論する
 * リテラル型は 97 件分の巨大な union になり、`impact` が `"high" | "medium" | ...` ではなく
 * 出現値の合併として広がる。境界をここ 1 箇所に閉じ、外へは宣言済みの型だけを出す。
 */
interface ReleaseDataset {
  readonly generatedBy: string;
  readonly sourceFiles: readonly string[];
  readonly rawCount: number;
  readonly entryCount: number;
  readonly entries: readonly ReleaseEntry[];
}

const dataset = releasesJson as unknown as ReleaseDataset;

export const RELEASE_ENTRIES: readonly ReleaseEntry[] = dataset.entries;

export const RELEASE_MONTHS: readonly MonthlyReleaseCount[] = summarizeByMonth(RELEASE_ENTRIES);

/** 年表が収録している期間（データが空なら null）。見出しの「◯◯〜◯◯」に使う */
export const RELEASE_PERIOD: {
  readonly from: string;
  readonly to: string;
} | null =
  RELEASE_ENTRIES.length > 0
    ? {
        from: RELEASE_ENTRIES[0].date,
        to: RELEASE_ENTRIES[RELEASE_ENTRIES.length - 1].date,
      }
    : null;

/** 抽出元となった日次・週次レポートの実数（重複を除く） */
export const RELEASE_SOURCE_REPORT_COUNT: number = new Set(
  RELEASE_ENTRIES.flatMap((e) => e.sources.map((s) => s.report)),
).size;
