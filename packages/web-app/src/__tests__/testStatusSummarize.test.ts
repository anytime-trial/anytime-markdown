import {
  buildTakeaway,
  filterRows,
  rankCoverageSmells,
  sortRows,
  summarize,
} from '../lib/testStatus/summarize';
import type { PackageTestRow } from '../lib/testStatus/types';

function row(overrides: Partial<PackageTestRow> & Pick<PackageTestRow, 'package'>): PackageTestRow {
  return {
    srcFiles: 10,
    testFiles: 2,
    inCI: true,
    fixes90d: 0,
    suites: 2,
    tests: 10,
    passed: 10,
    failed: 0,
    skipped: 0,
    durationSec: 1,
    result: 'pass',
    coverageNamed: 0,
    weak: 0,
    expects: 20,
    ...overrides,
  };
}

const ROWS: PackageTestRow[] = [
  row({ package: 'alpha', tests: 100, passed: 98, failed: 2, result: 'fail' }),
  row({ package: 'beta', tests: 40, passed: 40, inCI: false }),
  row({ package: 'gamma', testFiles: 0, suites: 0, tests: 0, passed: 0, result: 'no-tests' }),
  row({ package: 'delta', srcFiles: 0, testFiles: 0, suites: 0, tests: 0, passed: 0, result: 'no-tests' }),
  row({ package: 'epsilon', tests: 5, passed: 4, skipped: 1, coverageNamed: 3, weak: 2, expects: 10 }),
];

describe('summarize', () => {
  it('テスト数・失敗・スキップを全パッケージで合計する', () => {
    const s = summarize(ROWS);
    expect(s.totalTests).toBe(145);
    expect(s.failed).toBe(2);
    expect(s.skipped).toBe(1);
  });

  it('CI で実行されないテストは、CI 外かつテストを持つパッケージだけを数える', () => {
    const s = summarize([...ROWS, row({ package: 'zeta', inCI: false, tests: 0, testFiles: 0, result: 'no-tests' })]);
    expect(s.testsOutsideCI).toBe(40);
    expect(s.packagesOutsideCI).toBe(1);
  });

  it('ソースがあるのにテストファイルが無いパッケージだけを「テスト無し」に数える', () => {
    const s = summarize(ROWS);
    expect(s.packagesWithoutTests).toBe(1);
    expect(s.packagesWithTests).toBe(3);
  });

  it('失敗・タイムアウト・起動エラーのパッケージを失敗パッケージに数える', () => {
    const s = summarize([
      ...ROWS,
      row({ package: 'eta', result: 'timeout' }),
      row({ package: 'theta', result: 'error' }),
    ]);
    expect(s.failedPackages).toBe(3);
  });

  it('時間切れ・起動失敗・jest 設定なしのパッケージを「実行できなかった」に数える', () => {
    const s = summarize([
      ...ROWS,
      row({ package: 'eta', result: 'timeout', tests: 0, passed: 0 }),
      row({ package: 'theta', result: 'error', tests: 0, passed: 0 }),
      row({ package: 'iota', result: 'no-config', tests: 0, passed: 0 }),
    ]);
    expect(s.unrunPackages).toBe(3);
  });

  it('行が無いときはすべて 0 を返す', () => {
    expect(summarize([])).toEqual({
      totalTests: 0,
      failed: 0,
      skipped: 0,
      packagesWithTests: 0,
      packagesWithoutTests: 0,
      testsOutsideCI: 0,
      packagesOutsideCI: 0,
      failedPackages: 0,
      unrunPackages: 0,
    });
  });
});

describe('filterRows', () => {
  it('CI 外のみを指定すると、CI 実行が無い行だけが残る', () => {
    expect(filterRows(ROWS, { outsideCIOnly: true, failedOnly: false }).map((r) => r.package)).toEqual(['beta']);
  });

  it('失敗のみを指定すると、失敗した行だけが残る', () => {
    expect(filterRows(ROWS, { outsideCIOnly: false, failedOnly: true }).map((r) => r.package)).toEqual(['alpha']);
  });

  it('両方を指定すると、CI 外かつ失敗した行だけが残る', () => {
    const rows = [...ROWS, row({ package: 'lambda', inCI: false, failed: 1, result: 'fail' })];
    expect(filterRows(rows, { outsideCIOnly: true, failedOnly: true }).map((r) => r.package)).toEqual(['lambda']);
  });

  it('どちらも指定しないと、テストを持たない行を含めてすべて残る', () => {
    expect(filterRows(ROWS, { outsideCIOnly: false, failedOnly: false })).toHaveLength(ROWS.length);
  });
});

describe('sortRows', () => {
  it('数値の列は数値として降順に並べる', () => {
    expect(sortRows(ROWS, 'tests', 'desc').map((r) => r.package)).toEqual(['alpha', 'beta', 'epsilon', 'gamma', 'delta']);
  });

  it('文字列の列は名前順に昇順で並べる', () => {
    expect(sortRows(ROWS, 'package', 'asc').map((r) => r.package)).toEqual(['alpha', 'beta', 'delta', 'epsilon', 'gamma']);
  });

  it('値が同じ行は元の順序を保つ', () => {
    expect(sortRows(ROWS, 'failed', 'asc').map((r) => r.package)).toEqual(['beta', 'gamma', 'delta', 'epsilon', 'alpha']);
  });

  it('元の配列を書き換えない', () => {
    const before = ROWS.map((r) => r.package);
    sortRows(ROWS, 'tests', 'desc');
    expect(ROWS.map((r) => r.package)).toEqual(before);
  });
});

describe('rankCoverageSmells', () => {
  it('兆候の無いパッケージを除き、カバレッジ目的ファイル数の多い順に並べる', () => {
    const ranked = rankCoverageSmells([
      ...ROWS,
      row({ package: 'iota', coverageNamed: 5, weak: 0 }),
      row({ package: 'kappa', coverageNamed: 0, weak: 4, expects: 8 }),
    ]);
    expect(ranked.map((r) => r.package)).toEqual(['iota', 'epsilon', 'kappa']);
  });

  it('弱い検証の割合を expect 数に対する比で返し、expect が 0 なら 0 にする', () => {
    const ranked = rankCoverageSmells([
      row({ package: 'a', coverageNamed: 1, weak: 2, expects: 10 }),
      row({ package: 'b', coverageNamed: 1, weak: 3, expects: 0 }),
    ]);
    expect(ranked.find((r) => r.package === 'a')?.weakRatio).toBeCloseTo(0.2);
    expect(ranked.find((r) => r.package === 'b')?.weakRatio).toBe(0);
  });
});

describe('buildTakeaway', () => {
  it('失敗と CI 外のテストがあれば、両方の件数を 1 文で述べる', () => {
    expect(buildTakeaway(summarize(ROWS))).toBe(
      '145 件中 2 件が失敗し、40 件（1 パッケージ）が CI で実行されていない。',
    );
  });

  it('失敗が無く CI 外だけがあれば、通ったうえで CI 外の件数を述べる', () => {
    expect(buildTakeaway(summarize([row({ package: 'a' }), row({ package: 'b', inCI: false })]))).toBe(
      '20 件すべてが通ったが、10 件（1 パッケージ）が CI で実行されていない。',
    );
  });

  it('失敗があり CI 外が無ければ、残りは CI で実行されていると述べる', () => {
    expect(buildTakeaway(summarize([row({ package: 'a', failed: 1, passed: 9, result: 'fail' })]))).toBe(
      '10 件中 1 件が失敗し、残りはすべて CI で実行されている。',
    );
  });

  it('テストの失敗が 0 でも実行できなかったパッケージがあれば「すべて通った」と言わない', () => {
    expect(
      buildTakeaway(summarize([row({ package: 'a' }), row({ package: 'b', result: 'timeout', tests: 0, passed: 0 })])),
    ).toBe('10 件中 1 パッケージのテストを実行できず、残りはすべて CI で実行されている。');
  });

  it('失敗も CI 外も無ければ、すべて通り CI で実行されていると述べる', () => {
    expect(buildTakeaway(summarize([row({ package: 'a' })]))).toBe(
      '10 件すべてが通り、すべて CI で実行されている。',
    );
  });
});
