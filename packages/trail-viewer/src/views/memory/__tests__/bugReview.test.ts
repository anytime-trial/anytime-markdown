/**
 * views/memory — vanilla DOM ユニットテスト（jsdom）
 *
 * mountBugCausalPanel / mountBugHistoryPanel / mountReviewPanel の
 * DOM 構造・インタラクション・update/destroy を検証する。
 * スタイルは tests では検証しない（jsdom は cssom 非評価）。
 */
import { mountBugCausalPanel, type BugCausalPanelProps } from '../bugCausalPanel';
import { mountBugHistoryPanel, type BugHistoryPanelProps } from '../bugHistoryPanel';
import { mountReviewPanel, type ReviewPanelProps } from '../reviewPanel';
import type { MemoryReader } from '../../../data/readers/MemoryReader';
import type {
  MemoryBugCausalInfo,
  MemoryBugHistoryRow,
  MemoryRecurringBugRow,
  MemoryReviewHistoryRow,
  MemoryUnaddressedReviewFindingRow,
} from '../../../data/types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const t = (key: string): string => key;

/** Promise.all を含む非同期チェーン全体をフラッシュする。 */
async function flush(): Promise<void> {
  // Promise.all は resolve に2ティック必要なので複数回 await する。
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeBugRow(over: Partial<MemoryBugHistoryRow> = {}): MemoryBugHistoryRow {
  return {
    id: 'b1',
    commitSha: 'abc1234',
    bugEntityId: 'entity-1',
    package: 'trail-viewer',
    category: 'regression',
    subjectSummary: 'Something broke',
    sessionId: 'sess-1',
    committedAt: '2026-01-10T00:00:00.000Z',
    precededByFindingIds: [],
    ...over,
  };
}

function makeRecurringRow(over: Partial<MemoryRecurringBugRow> = {}): MemoryRecurringBugRow {
  return {
    id: 'r1',
    subjectEntityId: 'e1',
    subjectDisplayName: 'TrailDataServer',
    driftType: 'regression',
    severity: 'error',
    detectedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function makeCausalInfo(over: Partial<MemoryBugCausalInfo> = {}): MemoryBugCausalInfo {
  return {
    bugEntityId: 'entity-1',
    subject: 'Something broke badly',
    category: 'regression',
    commitSha: 'abc1234',
    committedAt: '2026-01-10T00:00:00.000Z',
    affectedFilePaths: [],
    rootCauses: [],
    siblingBugEntityIds: [],
    precedingFindings: [],
    introducedByCommitSha: null,
    introducedByCommitSubject: null,
    ...over,
  };
}

function makeReviewRow(over: Partial<MemoryReviewHistoryRow> = {}): MemoryReviewHistoryRow {
  return {
    id: 'rv1',
    reviewId: 'rev-1',
    findingEntityId: 'finding-1',
    title: 'Missing null check',
    reviewer: 'Claude Code',
    sourceKind: 'agent',
    model: 'claude-sonnet-4',
    sessionId: 'sess-2',
    reviewedAt: '2026-01-15T00:00:00.000Z',
    targetFilePath: 'packages/trail-viewer/src/foo.ts',
    category: 'logic',
    severity: 'warn',
    findingText: 'Potential null dereference on line 42',
    addressedCommitSha: null,
    addressedAt: null,
    precedesBugEntityIds: [],
    ...over,
  };
}

function makeUnaddressedRow(
  over: Partial<MemoryUnaddressedReviewFindingRow> = {},
): MemoryUnaddressedReviewFindingRow {
  return {
    id: 'u1',
    reviewId: 'rev-1',
    targetFilePath: 'packages/trail-viewer/src/foo.ts',
    category: 'logic',
    severity: 'error',
    findingText: 'Unaddressed finding',
    recordedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/** MemoryReader のシンプルな mock を作る。 */
function makeReader(overrides: Partial<{
  listRecurringBugs: () => Promise<readonly MemoryRecurringBugRow[]>;
  getBugHistory: () => Promise<readonly MemoryBugHistoryRow[]>;
  getBugCausalInfo: (id: string) => Promise<MemoryBugCausalInfo | null>;
  listUnaddressedReviewFindings: () => Promise<readonly MemoryUnaddressedReviewFindingRow[]>;
  getReviewHistory: () => Promise<readonly MemoryReviewHistoryRow[]>;
}> = {}): MemoryReader {
  return {
    listRecurringBugs: overrides.listRecurringBugs ?? (() => Promise.resolve([])),
    getBugHistory: overrides.getBugHistory ?? (() => Promise.resolve([])),
    getBugCausalInfo: overrides.getBugCausalInfo ?? (() => Promise.resolve(null)),
    listUnaddressedReviewFindings:
      overrides.listUnaddressedReviewFindings ?? (() => Promise.resolve([])),
    getReviewHistory: overrides.getReviewHistory ?? (() => Promise.resolve([])),
  } as unknown as MemoryReader;
}

// ---------------------------------------------------------------------------
// mountBugCausalPanel
// ---------------------------------------------------------------------------

describe('mountBugCausalPanel', () => {
  it('bugEntityId が null なら empty メッセージを表示する', () => {
    const c = document.createElement('div');
    mountBugCausalPanel(c, {
      t,
      reader: makeReader(),
      bugEntityId: null,
    });
    expect(c.textContent).toContain('memory.bug.causedBy.empty');
  });

  it('reader が null でも empty メッセージを表示する', () => {
    const c = document.createElement('div');
    mountBugCausalPanel(c, { t, reader: null, bugEntityId: 'entity-1' });
    expect(c.textContent).toContain('memory.bug.causedBy.empty');
  });

  it('読み込み中は loading メッセージを表示する', () => {
    const c = document.createElement('div');
    // never resolves → stays in loading state
    const reader = makeReader({
      getBugCausalInfo: () => new Promise(() => {}),
    });
    mountBugCausalPanel(c, { t, reader, bugEntityId: 'entity-1' });
    expect(c.textContent).toContain('memory.loading');
  });

  it('data 取得後に subject と category を表示する', async () => {
    const c = document.createElement('div');
    const info = makeCausalInfo({ subject: 'Terrible bug', category: 'logic' });
    const reader = makeReader({ getBugCausalInfo: () => Promise.resolve(info) });
    mountBugCausalPanel(c, { t, reader, bugEntityId: 'entity-1' });
    await flush();
    expect(c.textContent).toContain('Terrible bug');
    expect(c.textContent).toContain('logic');
  });

  it('siblingBugEntityIds があれば sibling セクションを表示する', async () => {
    const c = document.createElement('div');
    const info = makeCausalInfo({ siblingBugEntityIds: ['e2', 'e3'] });
    const reader = makeReader({ getBugCausalInfo: () => Promise.resolve(info) });
    mountBugCausalPanel(c, { t, reader, bugEntityId: 'entity-1' });
    await flush();
    expect(c.textContent).toContain('memory.bug.causal.sibling');
    expect(c.textContent).toContain('2');
  });

  it('siblingBugEntityIds チップクリックで onOpenSiblingBugs を呼ぶ', async () => {
    const c = document.createElement('div');
    const ids = ['e2', 'e3'];
    let called: readonly string[] | null = null;
    const info = makeCausalInfo({ siblingBugEntityIds: ids });
    const reader = makeReader({ getBugCausalInfo: () => Promise.resolve(info) });
    mountBugCausalPanel(c, {
      t,
      reader,
      bugEntityId: 'entity-1',
      onOpenSiblingBugs: (idsArg) => { called = idsArg; },
    });
    await flush();
    const siblingChip = [...c.querySelectorAll('[role="button"]')].find((el) =>
      el.textContent?.includes('memory.bug.causal.bugsUnit'),
    ) as HTMLElement | undefined;
    expect(siblingChip).toBeDefined();
    siblingChip!.click();
    expect(called).toEqual(ids);
  });

  it('precedingFindings があれば findings セクションを表示する', async () => {
    const c = document.createElement('div');
    const info = makeCausalInfo({
      precedingFindings: [
        { findingEntityId: 'f1', targetFilePath: 'packages/foo.ts', severity: 'warn' },
      ],
    });
    const reader = makeReader({ getBugCausalInfo: () => Promise.resolve(info) });
    mountBugCausalPanel(c, { t, reader, bugEntityId: 'entity-1' });
    await flush();
    expect(c.textContent).toContain('memory.bug.causal.preceding');
    expect(c.textContent).toContain('packages/foo.ts');
  });

  it('introducedByCommitSha があれば introducedBy セクションを表示する', async () => {
    const c = document.createElement('div');
    const info = makeCausalInfo({
      introducedByCommitSha: 'deadbeef1234',
      introducedByCommitSubject: 'Fix something',
    });
    const reader = makeReader({ getBugCausalInfo: () => Promise.resolve(info) });
    mountBugCausalPanel(c, { t, reader, bugEntityId: 'entity-1' });
    await flush();
    expect(c.textContent).toContain('memory.bug.causal.introducedBy');
    // slice(0,7) of 'deadbeef1234' = 'deadbee'
    expect(c.textContent).toContain('deadbee');
    expect(c.textContent).toContain('Fix something');
  });

  it('affectedFilePaths があれば affectedFiles セクションを表示する', async () => {
    const c = document.createElement('div');
    const info = makeCausalInfo({
      affectedFilePaths: ['packages/foo.ts', 'packages/bar.ts'],
    });
    const reader = makeReader({ getBugCausalInfo: () => Promise.resolve(info) });
    mountBugCausalPanel(c, { t, reader, bugEntityId: 'entity-1' });
    await flush();
    expect(c.textContent).toContain('memory.bug.causal.affectedFiles');
    expect(c.textContent).toContain('packages/foo.ts');
  });

  it('rootCauses があれば rootCauses セクションを表示する', async () => {
    const c = document.createElement('div');
    const info = makeCausalInfo({
      rootCauses: [{ entityId: 'rc1', displayName: 'Missing guard' }],
    });
    const reader = makeReader({ getBugCausalInfo: () => Promise.resolve(info) });
    mountBugCausalPanel(c, { t, reader, bugEntityId: 'entity-1' });
    await flush();
    expect(c.textContent).toContain('memory.bug.causal.rootCauses');
    expect(c.textContent).toContain('Missing guard');
  });

  it('全セクション空なら noCauses を表示する', async () => {
    const c = document.createElement('div');
    const info = makeCausalInfo();
    const reader = makeReader({ getBugCausalInfo: () => Promise.resolve(info) });
    mountBugCausalPanel(c, { t, reader, bugEntityId: 'entity-1' });
    await flush();
    expect(c.textContent).toContain('memory.bug.causal.noCauses');
  });

  it('bugEntityId が変わると再ロードする', async () => {
    const c = document.createElement('div');
    const info1 = makeCausalInfo({ subject: 'Bug one', bugEntityId: 'e1' });
    const info2 = makeCausalInfo({ subject: 'Bug two', bugEntityId: 'e2' });
    let callCount = 0;
    const reader = makeReader({
      getBugCausalInfo: (id: string) => {
        callCount += 1;
        return Promise.resolve(id === 'e1' ? info1 : info2);
      },
    });
    const handle = mountBugCausalPanel(c, { t, reader, bugEntityId: 'e1' });
    await flush();
    expect(c.textContent).toContain('Bug one');

    handle.update({ t, reader, bugEntityId: 'e2' });
    await flush();
    expect(c.textContent).toContain('Bug two');
    expect(callCount).toBe(2);
  });

  it('destroy で DOM が除去される', () => {
    const c = document.createElement('div');
    const handle = mountBugCausalPanel(c, { t, reader: null, bugEntityId: null });
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mountBugHistoryPanel
// ---------------------------------------------------------------------------

describe('mountBugHistoryPanel', () => {
  function baseProps(over: Partial<BugHistoryPanelProps> = {}): BugHistoryPanelProps {
    return { t, reader: null, ...over };
  }

  it('reader が null なら empty メッセージを表示する', () => {
    const c = document.createElement('div');
    mountBugHistoryPanel(c, baseProps());
    expect(c.textContent).toContain('memory.bug.empty');
  });

  it('reader がいてバグ履歴があればテーブルを描画する', async () => {
    const c = document.createElement('div');
    const reader = makeReader({
      getBugHistory: () => Promise.resolve([makeBugRow()]),
      listRecurringBugs: () => Promise.resolve([]),
    });
    mountBugHistoryPanel(c, baseProps({ reader }));
    await flush();
    const table = c.querySelector('[aria-label="bug-history-table"]');
    expect(table).not.toBeNull();
    expect(table?.textContent).toContain('trail-viewer');
    expect(table?.textContent).toContain('regression');
    expect(table?.textContent).toContain('abc1234'.slice(0, 7));
  });

  it('バグ履歴が空なら empty メッセージを表示する', async () => {
    const c = document.createElement('div');
    const reader = makeReader({
      getBugHistory: () => Promise.resolve([]),
      listRecurringBugs: () => Promise.resolve([]),
    });
    mountBugHistoryPanel(c, baseProps({ reader }));
    await flush();
    expect(c.querySelector('[aria-label="bug-history-table"]')).toBeNull();
    expect(c.textContent).toContain('memory.bug.empty');
  });

  it('recurring bugs があれば recurring セクションを表示する', async () => {
    const c = document.createElement('div');
    const reader = makeReader({
      getBugHistory: () => Promise.resolve([]),
      listRecurringBugs: () => Promise.resolve([makeRecurringRow()]),
    });
    mountBugHistoryPanel(c, baseProps({ reader }));
    await flush();
    const section = c.querySelector('[aria-label="recurring-bugs"]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('memory.bug.recurring');
    expect(section?.textContent).toContain('TrailDataServer');
  });

  it('テーブル行クリックで BugCausal パネルが更新される（バグ ID 反映）', async () => {
    const c = document.createElement('div');
    const causalInfo = makeCausalInfo({ subject: 'Regression info', bugEntityId: 'entity-1' });
    const reader = makeReader({
      getBugHistory: () => Promise.resolve([makeBugRow({ bugEntityId: 'entity-1' })]),
      listRecurringBugs: () => Promise.resolve([]),
      getBugCausalInfo: () => Promise.resolve(causalInfo),
    });
    mountBugHistoryPanel(c, baseProps({ reader }));
    await flush();

    const table = c.querySelector('[aria-label="bug-history-table"]') as HTMLElement;
    const row = table.querySelector('tbody tr') as HTMLElement;
    expect(row).not.toBeNull();
    row.click();

    // causal panel should now be loading / will resolve
    await flush();
    const causalPanel = c.querySelector('[aria-label="bug-causal"]');
    expect(causalPanel).not.toBeNull();
    expect(causalPanel?.textContent).toContain('Regression info');
  });

  it('pendingBugFilter でテーブルが絞り込まれる', async () => {
    const c = document.createElement('div');
    const rows = [
      makeBugRow({ id: 'b1', bugEntityId: 'entity-1' }),
      makeBugRow({ id: 'b2', bugEntityId: 'entity-2', package: 'graph-core' }),
    ];
    const reader = makeReader({
      getBugHistory: () => Promise.resolve(rows),
      listRecurringBugs: () => Promise.resolve([]),
    });
    mountBugHistoryPanel(c, baseProps({ reader, pendingBugFilter: { bugEntityIds: ['entity-1'] } }));
    await flush();

    const trs = c.querySelectorAll('[aria-label="bug-history-table"] tbody tr');
    expect(trs.length).toBe(1);
  });

  it('openInMessages ボタンクリックで onOpenSessionMessages を呼ぶ', async () => {
    const c = document.createElement('div');
    let openedId: string | null = null;
    const reader = makeReader({
      getBugHistory: () => Promise.resolve([makeBugRow({ sessionId: 'sess-42' })]),
      listRecurringBugs: () => Promise.resolve([]),
    });
    mountBugHistoryPanel(
      c,
      baseProps({ reader, onOpenSessionMessages: (id) => { openedId = id; } }),
    );
    await flush();

    const openBtn = c.querySelector(
      `[aria-label="${t('memory.bug.openInMessages')}"]`,
    ) as HTMLElement | null;
    expect(openBtn).not.toBeNull();
    openBtn!.click();
    expect(openedId).toBe('sess-42');
  });

  it('precededByFindingIds チップクリックで onOpenPrecedingReviews を呼ぶ', async () => {
    const c = document.createElement('div');
    let openedIds: readonly string[] | null = null;
    const row = makeBugRow({ precededByFindingIds: ['f1', 'f2'] });
    const reader = makeReader({
      getBugHistory: () => Promise.resolve([row]),
      listRecurringBugs: () => Promise.resolve([]),
    });
    mountBugHistoryPanel(
      c,
      baseProps({ reader, onOpenPrecedingReviews: (ids) => { openedIds = ids; } }),
    );
    await flush();

    const chip = [...c.querySelectorAll('[role="button"]')].find((el) =>
      el.textContent?.includes('↩ 2'),
    ) as HTMLElement | undefined;
    expect(chip).toBeDefined();
    chip!.click();
    expect(openedIds).toEqual(['f1', 'f2']);
  });

  it('destroy で DOM が除去される', async () => {
    const c = document.createElement('div');
    const handle = mountBugHistoryPanel(c, baseProps());
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mountReviewPanel
// ---------------------------------------------------------------------------

describe('mountReviewPanel', () => {
  function baseProps(over: Partial<ReviewPanelProps> = {}): ReviewPanelProps {
    return { t, reader: null, ...over };
  }

  it('reader が null なら empty メッセージを表示する', () => {
    const c = document.createElement('div');
    mountReviewPanel(c, baseProps());
    expect(c.textContent).toContain('memory.review.empty');
  });

  it('reader がいてレビュー履歴があればテーブルを描画する', async () => {
    const c = document.createElement('div');
    const reader = makeReader({
      getReviewHistory: () => Promise.resolve([makeReviewRow()]),
      listUnaddressedReviewFindings: () => Promise.resolve([]),
    });
    mountReviewPanel(c, baseProps({ reader }));
    await flush();
    const table = c.querySelector('[aria-label="review-history-table"]');
    expect(table).not.toBeNull();
    expect(table?.textContent).toContain('Potential null dereference');
    expect(table?.textContent).toContain('logic');
    expect(table?.textContent).toContain('warn');
  });

  it('レビュー履歴が空なら empty メッセージを表示する', async () => {
    const c = document.createElement('div');
    const reader = makeReader({
      getReviewHistory: () => Promise.resolve([]),
      listUnaddressedReviewFindings: () => Promise.resolve([]),
    });
    mountReviewPanel(c, baseProps({ reader }));
    await flush();
    expect(c.querySelector('[aria-label="review-history-table"]')).toBeNull();
    expect(c.textContent).toContain('memory.review.empty');
  });

  it('unaddressed findings があれば severity チップを表示する', async () => {
    const c = document.createElement('div');
    const reader = makeReader({
      getReviewHistory: () => Promise.resolve([]),
      listUnaddressedReviewFindings: () =>
        Promise.resolve([
          makeUnaddressedRow({ severity: 'error' }),
          makeUnaddressedRow({ id: 'u2', severity: 'warn' }),
        ]),
    });
    mountReviewPanel(c, baseProps({ reader }));
    await flush();
    expect(c.textContent).toContain('memory.review.unaddressed');
    expect(c.textContent).toContain('error: 1');
    expect(c.textContent).toContain('warn: 1');
  });

  it('pendingReviewFilter でテーブルが絞り込まれる', async () => {
    const c = document.createElement('div');
    const rows = [
      makeReviewRow({ id: 'r1', findingEntityId: 'f1' }),
      makeReviewRow({ id: 'r2', findingEntityId: 'f2' }),
    ];
    const reader = makeReader({
      getReviewHistory: () => Promise.resolve(rows),
      listUnaddressedReviewFindings: () => Promise.resolve([]),
    });
    mountReviewPanel(c, baseProps({ reader, pendingReviewFilter: { findingEntityIds: ['f1'] } }));
    await flush();

    const trs = c.querySelectorAll('[aria-label="review-history-table"] tbody tr');
    expect(trs.length).toBe(1);
  });

  it('addressed 行は addressed チップを表示する', async () => {
    const c = document.createElement('div');
    const row = makeReviewRow({
      addressedCommitSha: 'abc123',
      addressedAt: '2026-02-01T00:00:00.000Z',
    });
    const reader = makeReader({
      getReviewHistory: () => Promise.resolve([row]),
      listUnaddressedReviewFindings: () => Promise.resolve([]),
    });
    mountReviewPanel(c, baseProps({ reader }));
    await flush();
    expect(c.textContent).toContain('memory.review.flow.addressed');
    expect(c.textContent).toContain('2026-02-01');
  });

  it('openInMessages ボタンクリックで onOpenSessionMessages を呼ぶ', async () => {
    const c = document.createElement('div');
    let openedId: string | null = null;
    const reader = makeReader({
      getReviewHistory: () => Promise.resolve([makeReviewRow({ sessionId: 'sess-99' })]),
      listUnaddressedReviewFindings: () => Promise.resolve([]),
    });
    mountReviewPanel(
      c,
      baseProps({ reader, onOpenSessionMessages: (id) => { openedId = id; } }),
    );
    await flush();

    const openBtn = c.querySelector(
      `[aria-label="${t('memory.review.openInMessages')}"]`,
    ) as HTMLElement | null;
    expect(openBtn).not.toBeNull();
    openBtn!.click();
    expect(openedId).toBe('sess-99');
  });

  it('precedesBugEntityIds チップクリックで onOpenPrecedingBugs を呼ぶ', async () => {
    const c = document.createElement('div');
    let openedIds: readonly string[] | null = null;
    const row = makeReviewRow({ precedesBugEntityIds: ['b1', 'b2'] });
    const reader = makeReader({
      getReviewHistory: () => Promise.resolve([row]),
      listUnaddressedReviewFindings: () => Promise.resolve([]),
    });
    mountReviewPanel(
      c,
      baseProps({ reader, onOpenPrecedingBugs: (ids) => { openedIds = ids; } }),
    );
    await flush();

    const chip = [...c.querySelectorAll('[role="button"]')].find((el) =>
      el.textContent?.includes('⚠ 2'),
    ) as HTMLElement | undefined;
    expect(chip).toBeDefined();
    chip!.click();
    expect(openedIds).toEqual(['b1', 'b2']);
  });

  it('formatReviewer: sourceKind=agent は Claude Code (model) を表示する', async () => {
    const c = document.createElement('div');
    const row = makeReviewRow({ sourceKind: 'agent', model: 'claude-sonnet-4', reviewer: '' });
    const reader = makeReader({
      getReviewHistory: () => Promise.resolve([row]),
      listUnaddressedReviewFindings: () => Promise.resolve([]),
    });
    mountReviewPanel(c, baseProps({ reader }));
    await flush();
    expect(c.textContent).toContain('Claude Code (claude-sonnet-4)');
  });

  it('destroy で DOM が除去される', () => {
    const c = document.createElement('div');
    const handle = mountReviewPanel(c, baseProps());
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });
});
