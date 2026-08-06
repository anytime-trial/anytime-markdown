/**
 * flightReviewFindingsView の純関数（絞り込み・カテゴリ列挙）と Review 表の列順。
 *
 * 列順を検査するのは、Review タブの表が「指摘 → 状態 → レビュー日 → 重要度 → カテゴリ →
 * 対象 → 指示」の順で読まれる前提で設計されているため。thead / tbody のどちらかだけを
 * 並べ替えると値が別の列へ入るが、件数や文字列の存在だけを見るテストは素通りする。
 */
import {
  deriveFindingStatus,
  filterFindings,
  findingCategories,
  renderFindingTable,
  type FindingFilter,
} from '../flightReviewFindingsView';
import type { MemoryFlightReviewFindingRow } from '../../data/types';

function finding(overrides: Partial<MemoryFlightReviewFindingRow> = {}): MemoryFlightReviewFindingRow {
  return {
    id: 'rf-1',
    findingEntityId: 'finding:rf-1',
    reviewId: 'rev-1',
    instructionId: 'inst-1',
    sessionId: 'sess-1',
    title: 'Session review sess-1',
    reviewer: 'pr-review-toolkit:code-reviewer',
    reviewedAt: '2026-08-05T02:00:00.000Z',
    workspace: 'anytime-markdown',
    targetFilePath: 'packages/trail-viewer/src/a.ts',
    targetRepo: 'anytime-markdown',
    category: 'logic',
    severity: 'error',
    findingText: '条件が反転している',
    addressedCommitSha: null,
    addressedAt: null,
    ...overrides,
  };
}

const NO_FILTER: FindingFilter = { severity: '', category: '', status: '' };

const t = (key: string): string => key;

describe('filterFindings', () => {
  const rows = [
    finding({ id: 'a', severity: 'error', category: 'logic', addressedCommitSha: null }),
    finding({ id: 'b', severity: 'warn', category: 'a11y', addressedCommitSha: 'deadbee' }),
    finding({ id: 'c', severity: 'info', category: 'logic', addressedCommitSha: '' }),
  ];

  it('絞り込みなしでは全件を返す', () => {
    expect(filterFindings(rows, NO_FILTER).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('重要度で絞る', () => {
    expect(filterFindings(rows, { ...NO_FILTER, severity: 'warn' }).map((r) => r.id)).toEqual(['b']);
  });

  it('カテゴリで絞る', () => {
    expect(filterFindings(rows, { ...NO_FILTER, category: 'logic' }).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('状態（対処済み）で絞る', () => {
    expect(filterFindings(rows, { ...NO_FILTER, status: 'addressed' }).map((r) => r.id)).toEqual(['b']);
  });

  it('状態（未対処）は判定対象の指摘だけを返す', () => {
    // 'c' は severity=info で自動判定の対象外。未対処へ混ぜると、本当に対処されていない
    // 指摘（'a'）が対象外の指摘に埋もれる。
    expect(filterFindings(rows, { ...NO_FILTER, status: 'unaddressed' }).map((r) => r.id)).toEqual(['a']);
  });

  it('状態（判定対象外）で絞る', () => {
    expect(filterFindings(rows, { ...NO_FILTER, status: 'notLinkable' }).map((r) => r.id)).toEqual(['c']);
  });

  it('複数条件は AND で効く', () => {
    const result = filterFindings(rows, { severity: 'info', category: 'logic', status: 'notLinkable' });
    expect(result.map((r) => r.id)).toEqual(['c']);
  });

  it('該当なしは空配列（元配列を返さない）', () => {
    expect(filterFindings(rows, { ...NO_FILTER, category: 'perf' })).toEqual([]);
  });
});

describe('deriveFindingStatus', () => {
  it('対処コミットがあれば対処済み', () => {
    expect(deriveFindingStatus(finding({ addressedCommitSha: 'deadbee' }))).toBe('addressed');
  });

  it('空文字の SHA は対処済みにしない', () => {
    // 空文字は「対処コミットが分からない」であって「対処済み」ではない。
    expect(deriveFindingStatus(finding({ addressedCommitSha: '' }))).toBe('unaddressed');
  });

  it('severity=info は判定対象外（linkAddresses が母集合から外す）', () => {
    expect(deriveFindingStatus(finding({ severity: 'info' }))).toBe('notLinkable');
  });

  it('対象ファイルが無い指摘は判定対象外', () => {
    expect(deriveFindingStatus(finding({ targetFilePath: null }))).toBe('notLinkable');
    expect(deriveFindingStatus(finding({ targetFilePath: '' }))).toBe('notLinkable');
  });

  it('対象リポジトリが解決できていない指摘は判定対象外', () => {
    // パスがあってもリポジトリ未解決ならコミット照合が走らない（実測 947 件中 864 件）。
    expect(deriveFindingStatus(finding({ targetRepo: null }))).toBe('notLinkable');
    expect(deriveFindingStatus(finding({ targetRepo: '' }))).toBe('notLinkable');
  });

  it('判定対象で対処コミットが無ければ未対処', () => {
    expect(deriveFindingStatus(finding())).toBe('unaddressed');
  });

  it('対処済みの判定は severity・対象の欠落より優先する', () => {
    // 手動リンク（link_review_to_commit）は自動判定の母集合外の指摘にも付く。
    const row = finding({ severity: 'info', targetFilePath: null, targetRepo: null, addressedCommitSha: 'cafe' });
    expect(deriveFindingStatus(row)).toBe('addressed');
  });
});

describe('findingCategories', () => {
  it('重複を畳んで昇順で返す', () => {
    const rows = [
      finding({ category: 'logic' }),
      finding({ category: 'a11y' }),
      finding({ category: 'logic' }),
      finding({ category: 'security' }),
    ];
    expect(findingCategories(rows)).toEqual(['a11y', 'logic', 'security']);
  });

  it('空文字のカテゴリは選択肢に出さない', () => {
    expect(findingCategories([finding({ category: '' }), finding({ category: 'logic' })])).toEqual(['logic']);
  });
});

describe('renderFindingTable', () => {
  function headerTexts(html: string): string[] {
    const host = document.createElement('div');
    host.innerHTML = html;
    return [...host.querySelectorAll('thead th')].map((th) => th.textContent ?? '');
  }

  function cellHtml(html: string): string[] {
    const host = document.createElement('div');
    host.innerHTML = html;
    return [...host.querySelectorAll('tbody tr:first-child td')].map((td) => td.innerHTML.trim());
  }

  const input = {
    t,
    findings: [finding()],
    loadFailed: false,
    linkable: false,
    labelOf: () => '指示ラベル',
  };

  it('列は 指摘 / 状態 / レビュー日 / 重要度 / カテゴリ / 対象 / 指示 の順', () => {
    expect(headerTexts(renderFindingTable(input))).toEqual([
      'flightRecord.findings.column.finding',
      'flightRecord.findings.column.status',
      'flightRecord.findings.column.reviewedAt',
      'flightRecord.findings.column.severity',
      'flightRecord.findings.column.category',
      'flightRecord.findings.column.target',
      'flightRecord.column.instruction',
    ]);
  });

  it('本文セルは列見出しと同じ順に並ぶ', () => {
    const cells = cellHtml(renderFindingTable(input));
    expect(cells[0]).toContain('条件が反転している');
    expect(cells[1]).toContain('data-am-finding-status');
    expect(cells[2]).toBe('2026-08-05');
    expect(cells[3]).toContain('data-am-finding-severity');
    expect(cells[4]).toBe('logic');
    expect(cells[5]).toContain('data-am-finding-target');
    expect(cells[6]).toBe('指示ラベル');
  });

  it('状態セルは 3 値を data-status で出し、判定対象外には理由を title で添える', () => {
    const host = document.createElement('div');
    host.innerHTML = renderFindingTable({ ...input, findings: [finding({ severity: 'info' })] });
    const cell = host.querySelector('[data-am-finding-status]');
    expect(cell?.getAttribute('data-status')).toBe('notLinkable');
    expect(cell?.getAttribute('title')).toBe('flightRecord.findings.notLinkableHint');
    expect(cell?.textContent).toBe('flightRecord.findings.notLinkable');
  });

  it('未対処の状態セルには title を付けない（説明が要るのは対象外だけ）', () => {
    const host = document.createElement('div');
    host.innerHTML = renderFindingTable(input);
    const cell = host.querySelector('[data-am-finding-status]');
    expect(cell?.getAttribute('data-status')).toBe('unaddressed');
    expect(cell?.getAttribute('title')).toBeNull();
  });

  it('絞り込みで 0 件になった場合は「指摘なし」と別の器で出す', () => {
    // 「絞って消えた」を「指摘は無い」と読ませない（レビュー漏れの見落としになる）。
    const host = document.createElement('div');
    host.innerHTML = renderFindingTable({ ...input, findings: [], filterActive: true });
    expect(host.querySelector('[data-am-finding-empty-filtered]')?.textContent).toBe(
      'flightRecord.findings.noneFiltered',
    );
    expect(host.querySelector('[data-am-finding-empty]')).toBeNull();
  });

  it('絞り込みなしで 0 件なら「指摘なし」を出す', () => {
    const host = document.createElement('div');
    host.innerHTML = renderFindingTable({ ...input, findings: [] });
    expect(host.querySelector('[data-am-finding-empty]')?.textContent).toBe('flightRecord.findings.none');
    expect(host.querySelector('[data-am-finding-empty-filtered]')).toBeNull();
  });

  it('表示件数と総件数を出す（絞り込みの効き具合が読めるように）', () => {
    const html = renderFindingTable({ ...input, totalCount: 3 });
    const host = document.createElement('div');
    host.innerHTML = html;
    expect(host.querySelector('[data-am-finding-shown]')?.textContent).toBe('1 / 3');
  });

  it('取得失敗は 0 件・絞り込み 0 件と別の顔で出す', () => {
    const host = document.createElement('div');
    host.innerHTML = renderFindingTable({ ...input, findings: [], loadFailed: true, filterActive: true });
    expect(host.querySelector('[data-am-finding-load-failed]')).not.toBeNull();
    expect(host.querySelector('[data-am-finding-empty-filtered]')).toBeNull();
  });
});
