/**
 * views/caravan — vanilla DOM ユニットテスト（jsdom）
 *
 * mountBugCausalPanel / mountBugHistoryPanel / mountReviewPanel の
 * DOM 構造・インタラクション・update/destroy を検証する。
 * スタイルは tests では検証しない（jsdom は cssom 非評価）。
 */
import { mountBugCausalPanel, type BugCausalPanelProps } from '../bugCausalPanel';
import { mountBugHistoryPanel, type BugHistoryPanelProps } from '../bugHistoryPanel';
import type { CaravanReader } from '../../../data/readers/CaravanReader';
import type {
  CaravanBugCausalInfo,
  CaravanBugHistoryRow,
  CaravanRecurringBugRow,
  CaravanReviewHistoryRow,
  CaravanUnaddressedReviewFindingRow,
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

function makeBugRow(over: Partial<CaravanBugHistoryRow> = {}): CaravanBugHistoryRow {
  return {
    id: 'b1',
    commitSha: 'abc1234',
    bugEntityId: 'entity-1',
    package: 'trail-viewer',
    category: 'regression',
    subjectSummary: 'Something broke',
    sessionId: 'sess-1',
    instructionId: 'inst-1',
    committedAt: '2026-01-10T00:00:00.000Z',
    precededByFindingIds: [],
    workspace: '',
    ...over,
  };
}

function makeRecurringRow(over: Partial<CaravanRecurringBugRow> = {}): CaravanRecurringBugRow {
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

function makeCausalInfo(over: Partial<CaravanBugCausalInfo> = {}): CaravanBugCausalInfo {
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

function makeReviewRow(over: Partial<CaravanReviewHistoryRow> = {}): CaravanReviewHistoryRow {
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
    workspace: 'anytime-markdown',
    targetRepo: 'anytime-markdown',
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
  over: Partial<CaravanUnaddressedReviewFindingRow> = {},
): CaravanUnaddressedReviewFindingRow {
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

/** CaravanReader のシンプルな mock を作る。 */
function makeReader(overrides: Partial<{
  listRecurringBugs: () => Promise<readonly CaravanRecurringBugRow[]>;
  getBugHistory: () => Promise<readonly CaravanBugHistoryRow[]>;
  getBugCausalInfo: (id: string) => Promise<CaravanBugCausalInfo | null>;
  listUnaddressedReviewFindings: () => Promise<readonly CaravanUnaddressedReviewFindingRow[]>;
  getReviewHistory: () => Promise<readonly CaravanReviewHistoryRow[]>;
}> = {}): CaravanReader {
  return {
    listRecurringBugs: overrides.listRecurringBugs ?? (() => Promise.resolve([])),
    getBugHistory: overrides.getBugHistory ?? (() => Promise.resolve([])),
    getBugCausalInfo: overrides.getBugCausalInfo ?? (() => Promise.resolve(null)),
    listUnaddressedReviewFindings:
      overrides.listUnaddressedReviewFindings ?? (() => Promise.resolve([])),
    getReviewHistory: overrides.getReviewHistory ?? (() => Promise.resolve([])),
  } as unknown as CaravanReader;
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
    expect(c.textContent).toContain('flightRecord.bugfix.causedBy.empty');
  });

  it('reader が null でも empty メッセージを表示する', () => {
    const c = document.createElement('div');
    mountBugCausalPanel(c, { t, reader: null, bugEntityId: 'entity-1' });
    expect(c.textContent).toContain('flightRecord.bugfix.causedBy.empty');
  });

  it('読み込み中は loading メッセージを表示する', () => {
    const c = document.createElement('div');
    // never resolves → stays in loading state
    const reader = makeReader({
      getBugCausalInfo: () => new Promise(() => {}),
    });
    mountBugCausalPanel(c, { t, reader, bugEntityId: 'entity-1' });
    expect(c.textContent).toContain('caravan.loading');
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
    expect(c.textContent).toContain('flightRecord.bugfix.causal.sibling');
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
      el.textContent?.includes('flightRecord.bugfix.causal.bugsUnit'),
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
    expect(c.textContent).toContain('flightRecord.bugfix.causal.preceding');
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
    expect(c.textContent).toContain('flightRecord.bugfix.causal.introducedBy');
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
    expect(c.textContent).toContain('flightRecord.bugfix.causal.affectedFiles');
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
    expect(c.textContent).toContain('flightRecord.bugfix.causal.rootCauses');
    expect(c.textContent).toContain('Missing guard');
  });

  it('全セクション空なら noCauses を表示する', async () => {
    const c = document.createElement('div');
    const info = makeCausalInfo();
    const reader = makeReader({ getBugCausalInfo: () => Promise.resolve(info) });
    mountBugCausalPanel(c, { t, reader, bugEntityId: 'entity-1' });
    await flush();
    expect(c.textContent).toContain('flightRecord.bugfix.causal.noCauses');
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
    return { t, reader: null, workspace: '', ...over };
  }

  it('reader が null なら empty メッセージを表示する', () => {
    const c = document.createElement('div');
    mountBugHistoryPanel(c, baseProps());
    expect(c.textContent).toContain('flightRecord.bugfix.empty');
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
    expect(table?.textContent).toContain('Something broke');
    expect(table?.textContent).toContain('2026-01-10');
    expect(table?.textContent).toContain('regression');
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
    expect(c.textContent).toContain('flightRecord.bugfix.empty');
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
    expect(section?.textContent).toContain('flightRecord.bugfix.recurring');
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

  it('列は Summary / Date / Category / ワークスペース / 指示 の順で、Package・Commit を出さない', async () => {
    const c = document.createElement('div');
    const reader = makeReader({
      getBugHistory: () => Promise.resolve([makeBugRow({ package: 'trail-viewer', commitSha: 'deadbeef123' })]),
      listRecurringBugs: () => Promise.resolve([]),
    });
    mountBugHistoryPanel(c, baseProps({ reader }));
    await flush();

    const heads = [...c.querySelectorAll('[aria-label="bug-history-table"] thead th')]
      .map((el) => el.textContent);
    expect(heads.slice(0, 5)).toEqual([
      'flightRecord.bugfix.column.summary',
      'flightRecord.bugfix.column.date',
      'flightRecord.bugfix.column.category',
      'flightRecord.column.workspace',
      'flightRecord.column.instruction',
    ]);

    const rowText = c.querySelector('[aria-label="bug-history-table"] tbody tr')?.textContent ?? '';
    expect(rowText).not.toContain('trail-viewer');
    expect(rowText).not.toContain('deadbeef');
  });

  it('ワークスペース列は行の workspace を出し、未解決（空文字）はダッシュにする', async () => {
    const c = document.createElement('div');
    const reader = makeReader({
      getBugHistory: () => Promise.resolve([
        makeBugRow({ id: 'b1', bugEntityId: 'e1', workspace: 'anytime-trade' }),
        makeBugRow({ id: 'b2', bugEntityId: 'e2', workspace: '' }),
      ]),
      listRecurringBugs: () => Promise.resolve([]),
    });
    mountBugHistoryPanel(c, baseProps({ reader }));
    await flush();

    const cells = [...c.querySelectorAll('[aria-label="bug-history-table"] [data-am-bug-workspace]')]
      .map((el) => el.textContent);
    // 空セルにしないのは、ワークスペースの概念が無い行と見分けが付かなくなるため。
    expect(cells).toEqual(['anytime-trade', '—']);
  });

  it('指示名セルのクリックで onSelectInstruction を呼び、行選択は起きない', async () => {
    const c = document.createElement('div');
    let selectedInstructionId: string | null = null;
    const reader = makeReader({
      getBugHistory: () => Promise.resolve([makeBugRow({ instructionId: 'inst-42' })]),
      listRecurringBugs: () => Promise.resolve([]),
    });
    mountBugHistoryPanel(
      c,
      baseProps({
        reader,
        labelOf: (id) => `label:${id}`,
        onSelectInstruction: (id) => { selectedInstructionId = id; },
      }),
    );
    await flush();

    const cell = c.querySelector('[data-am-bug-instruction]') as HTMLElement | null;
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('label:inst-42');
    cell!.click();
    expect(selectedInstructionId).toBe('inst-42');
    // 行クリック（バグ選択）へは伝播させない
    const row = c.querySelector('[aria-label="bug-history-table"] tbody tr') as HTMLElement;
    expect(row.getAttribute('aria-selected')).toBe('false');
  });

  it('instructionId が無い行は押せない指示名を出さない', async () => {
    const c = document.createElement('div');
    const reader = makeReader({
      getBugHistory: () => Promise.resolve([makeBugRow({ instructionId: null })]),
      listRecurringBugs: () => Promise.resolve([]),
    });
    mountBugHistoryPanel(c, baseProps({ reader, onSelectInstruction: () => {} }));
    await flush();
    expect(c.querySelector('[data-am-bug-instruction]')).toBeNull();
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

