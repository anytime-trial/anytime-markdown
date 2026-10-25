import type {
  CoverageSmellRow,
  PackageTestRow,
  RowFilter,
  SortDirection,
  SortKey,
  TestStatusSummary,
} from './types';

const FAILED_RESULTS = new Set<PackageTestRow['result']>(['fail', 'timeout', 'error']);
const UNRUN_RESULTS = new Set<PackageTestRow['result']>(['timeout', 'error', 'no-config']);

function isFailed(row: PackageTestRow): boolean {
  return FAILED_RESULTS.has(row.result);
}

export function summarize(rows: readonly PackageTestRow[]): TestStatusSummary {
  let totalTests = 0;
  let failed = 0;
  let skipped = 0;
  let packagesWithTests = 0;
  let packagesWithoutTests = 0;
  let testsOutsideCI = 0;
  let packagesOutsideCI = 0;
  let failedPackages = 0;
  let unrunPackages = 0;
  for (const row of rows) {
    totalTests += row.tests;
    failed += row.failed;
    skipped += row.skipped;
    if (row.testFiles > 0) packagesWithTests++;
    // ソースを持たない集約パッケージ（拡張パック等）はテストが無くて当然なので数えない
    else if (row.srcFiles > 0) packagesWithoutTests++;
    if (!row.inCI && row.tests > 0) {
      testsOutsideCI += row.tests;
      packagesOutsideCI++;
    }
    if (isFailed(row)) failedPackages++;
    if (UNRUN_RESULTS.has(row.result)) unrunPackages++;
  }
  return {
    totalTests,
    failed,
    skipped,
    packagesWithTests,
    packagesWithoutTests,
    testsOutsideCI,
    packagesOutsideCI,
    failedPackages,
    unrunPackages,
  };
}

export function filterRows(rows: readonly PackageTestRow[], filter: RowFilter): PackageTestRow[] {
  return rows.filter((row) => {
    if (filter.outsideCIOnly && (row.inCI || row.tests === 0)) return false;
    if (filter.failedOnly && !isFailed(row)) return false;
    return true;
  });
}

export function sortRows(
  rows: readonly PackageTestRow[],
  key: SortKey,
  direction: SortDirection,
): PackageTestRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  // Array.prototype.sort は安定ソートなので、同値の行は元の順序を保つ
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    const diff =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right));
    return diff * sign;
  });
}

export function rankCoverageSmells(rows: readonly PackageTestRow[]): CoverageSmellRow[] {
  return rows
    .filter((row) => row.coverageNamed > 0 || row.weak > 0)
    .map((row) => ({
      package: row.package,
      coverageNamed: row.coverageNamed,
      weak: row.weak,
      expects: row.expects,
      weakRatio: row.expects > 0 ? row.weak / row.expects : 0,
    }))
    .sort((a, b) => b.coverageNamed - a.coverageNamed || b.weakRatio - a.weakRatio);
}

const COUNT = new Intl.NumberFormat('ja-JP');

export function buildTakeaway(summary: TestStatusSummary): string {
  const total = COUNT.format(summary.totalTests);
  const outside = `${COUNT.format(summary.testsOutsideCI)} 件（${summary.packagesOutsideCI} パッケージ）が CI で実行されていない`;
  // 起動できなかったパッケージは failed に現れない。数えずに「すべて通った」と書くと事実に反する
  const problems: string[] = [];
  if (summary.failed > 0) problems.push(`${COUNT.format(summary.failed)} 件が失敗し`);
  if (summary.unrunPackages > 0) problems.push(`${summary.unrunPackages} パッケージのテストを実行できず`);
  if (problems.length > 0) {
    const rest = summary.testsOutsideCI > 0 ? outside : '残りはすべて CI で実行されている';
    return `${total} 件中 ${problems.join('、')}、${rest}。`;
  }
  if (summary.testsOutsideCI > 0) {
    return `${total} 件すべてが通ったが、${outside}。`;
  }
  return `${total} 件すべてが通り、すべて CI で実行されている。`;
}
