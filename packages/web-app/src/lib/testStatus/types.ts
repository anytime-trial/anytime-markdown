/** パッケージごとのテスト実行の結末。`no-config` はテストファイルがあるのに jest 設定が無い状態 */
export type TestRunResult = 'pass' | 'fail' | 'timeout' | 'error' | 'no-tests' | 'no-config';

/** 収集スクリプト（`npm run data:test-status`）が 1 パッケージにつき 1 行出す実行結果 */
export interface PackageTestRow {
  readonly package: string;
  readonly srcFiles: number;
  readonly testFiles: number;
  /** ci.yml のテストステップか coverage-remaining の一覧に載っているか */
  readonly inCI: boolean;
  /** 直近 90 日の `fix(<package>/...)` コミット件数 */
  readonly fixes90d: number;
  readonly suites: number;
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly durationSec: number;
  readonly result: TestRunResult;
  /** ファイル名に coverage / additional / extra を含むテストファイルの数 */
  readonly coverageNamed: number;
  /** `toBeDefined()` / `toBeTruthy()` / `not.toThrow()` の数 */
  readonly weak: number;
  readonly expects: number;
}

export interface TestStatusSnapshot {
  readonly commit: string;
  readonly runAt: string;
  readonly rows: readonly PackageTestRow[];
}

/** テスト実施の指針 §11 の 1 行に対する実施状況 */
export type MeansState = 'done' | 'partial' | 'none' | 'na';

export type CostLevel = '低' | '低〜中' | '中' | '中〜高' | '高';

export interface MeansRow {
  readonly id: string;
  readonly name: string;
  /** 指針の節（例: §6.1） */
  readonly section: string;
  readonly cost: CostLevel;
  readonly need: string;
  readonly state: MeansState;
  readonly basis: string;
}

export interface MeansDataset {
  readonly evaluatedAt: string;
  readonly source: string;
  readonly rows: readonly MeansRow[];
}

export interface TestStatusSummary {
  readonly totalTests: number;
  readonly failed: number;
  readonly skipped: number;
  readonly packagesWithTests: number;
  readonly packagesWithoutTests: number;
  readonly testsOutsideCI: number;
  readonly packagesOutsideCI: number;
  readonly failedPackages: number;
  /** 時間切れ・起動失敗・jest 設定なしで、結果が 1 件も得られなかったパッケージ */
  readonly unrunPackages: number;
}

export interface RowFilter {
  readonly outsideCIOnly: boolean;
  readonly failedOnly: boolean;
}

export type SortKey = keyof Pick<
  PackageTestRow,
  'package' | 'tests' | 'failed' | 'skipped' | 'durationSec' | 'fixes90d' | 'coverageNamed' | 'weak'
>;

export type SortDirection = 'asc' | 'desc';

export interface CoverageSmellRow {
  readonly package: string;
  readonly coverageNamed: number;
  readonly weak: number;
  readonly expects: number;
  /** weak / expects（expects が 0 なら 0） */
  readonly weakRatio: number;
}
