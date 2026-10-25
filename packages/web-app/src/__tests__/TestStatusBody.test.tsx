import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import TestStatusBody from '../app/[locale]/test-status/TestStatusBody';
import { findAbsolutePaths } from '../lib/testStatus/collect';
import { TEST_MEANS, TEST_STATUS_SNAPSHOT } from '../lib/testStatus/data';
import type { MeansDataset, PackageTestRow, TestStatusSnapshot } from '../lib/testStatus/types';

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

const SNAPSHOT: TestStatusSnapshot = {
  commit: 'abc1234',
  runAt: '2026-10-25T03:00:00.000Z',
  rows: [
    row({ package: 'trail-db', tests: 1437, passed: 1436, failed: 1, result: 'fail' }),
    row({ package: 'trail-viewer', tests: 1441, passed: 1441, inCI: false }),
    row({ package: 'web-app', tests: 1293, passed: 1293, coverageNamed: 22, weak: 5, expects: 100 }),
  ],
};

const MEANS: MeansDataset = {
  evaluatedAt: '2026-10-25',
  source: 'tech/test/20261025-test-evaluation.ja.md',
  rows: [
    { id: 'contract', name: '契約テスト', section: '§6.3', cost: '低〜中', need: '高', state: 'none', basis: 'スキーマ固定なし' },
  ],
};

function packageNames(): string[] {
  return screen
    .getAllByTestId('test-status-package-row')
    .map((tr) => tr.querySelector('th')?.textContent ?? '');
}

describe('TestStatusBody', () => {
  it('総テスト数・失敗数・CI 外の件数を要約の 1 文と集計に出す', () => {
    render(<TestStatusBody snapshot={SNAPSHOT} means={MEANS} />);
    expect(screen.getByTestId('test-status-takeaway').textContent).toBe(
      '4,171 件中 1 件が失敗し、1,441 件（1 パッケージ）が CI で実行されていない。',
    );
    const stats = screen.getByTestId('test-status-stats');
    expect(within(stats).queryByText('4,171 件')).not.toBeNull();
    expect(within(stats).queryByText('1,441 件')).not.toBeNull();
  });

  it('対象コミットをリポジトリのコミットへのリンクで示す', () => {
    render(<TestStatusBody snapshot={SNAPSHOT} means={MEANS} />);
    expect(screen.getByRole('link', { name: 'abc1234' }).getAttribute('href')).toBe(
      'https://github.com/anytime-trial/anytime-markdown/commit/abc1234',
    );
  });

  it('「CI 外のみ」を有効にすると、CI で実行されないパッケージだけが残る', () => {
    render(<TestStatusBody snapshot={SNAPSHOT} means={MEANS} />);
    fireEvent.click(screen.getByRole('switch', { name: 'CI 外のみ' }));
    expect(packageNames()).toEqual(['trail-viewer']);
    expect(screen.queryByText('1 パッケージを表示しています。')).not.toBeNull();
  });

  it('「失敗のみ」を有効にすると、失敗したパッケージだけが残る', () => {
    render(<TestStatusBody snapshot={SNAPSHOT} means={MEANS} />);
    fireEvent.click(screen.getByRole('switch', { name: '失敗のみ' }));
    expect(packageNames()).toEqual(['trail-db']);
  });

  it('列見出しを押すとその列で並べ替え、もう一度押すと向きが変わる', () => {
    render(<TestStatusBody snapshot={SNAPSHOT} means={MEANS} />);
    expect(packageNames()).toEqual(['trail-viewer', 'trail-db', 'web-app']);
    const header = screen.getByRole('button', { name: 'パッケージ' });
    fireEvent.click(header);
    expect(packageNames()).toEqual(['trail-db', 'trail-viewer', 'web-app']);
    fireEvent.click(header);
    expect(packageNames()).toEqual(['web-app', 'trail-viewer', 'trail-db']);
  });

  it('手段別の状態を記号とラベルで示す', () => {
    render(<TestStatusBody snapshot={SNAPSHOT} means={MEANS} />);
    expect(within(screen.getByTestId('test-status-means-contract')).queryByText('○ 未実施')).not.toBeNull();
  });

  it('カバレッジ目的のテストの兆候があるパッケージだけを一覧にする', () => {
    render(<TestStatusBody snapshot={SNAPSHOT} means={MEANS} />);
    const rows = screen.getAllByTestId('test-status-smell-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).queryByText('web-app')).not.toBeNull();
    expect(within(rows[0]).queryByText('5%')).not.toBeNull();
  });
});

describe('コミット済みのスナップショット', () => {
  it('絶対パスを含まない（SEC-01）', () => {
    expect(findAbsolutePaths(JSON.stringify(TEST_STATUS_SNAPSHOT))).toEqual([]);
    expect(findAbsolutePaths(JSON.stringify(TEST_MEANS))).toEqual([]);
  });

  // failed は起動に失敗したスイートも数えるため、テスト数との比較には入れない
  it('各行の成功とスキップの合計がテスト数を超えない', () => {
    const over = TEST_STATUS_SNAPSHOT.rows.filter((r) => r.passed + r.skipped > r.tests).map((r) => r.package);
    expect(over).toEqual([]);
  });

  it('手段別の状態は定義済みの値だけを使う', () => {
    const states = new Set(['done', 'partial', 'none', 'na']);
    expect(TEST_MEANS.rows.filter((m) => !states.has(m.state))).toEqual([]);
  });
});
