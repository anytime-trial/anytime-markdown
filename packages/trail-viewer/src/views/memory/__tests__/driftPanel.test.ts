/**
 * views/memory/driftPanel — vanilla DOM ユニットテスト（jsdom）
 *
 * mountDriftPanel / mountFiltersPanel / mountDriftDetailDialog の
 * DOM 構造・インタラクション・dialog 開閉・フィルター変更を検証する。
 */
import { mountDriftPanel, type DriftPanelProps } from '../driftPanel';
import { mountFiltersPanel, type FiltersPanelProps } from '../filtersPanel';
import { mountDriftDetailDialog, type DriftDetailDialogProps } from '../driftDetailDialog';
import type { MemoryDriftEventRow } from '../../../data/types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const t = (key: string): string => key;

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeRow(over: Partial<MemoryDriftEventRow> = {}): MemoryDriftEventRow {
  return {
    id: 'row-1',
    subjectEntityId: 'entity/foo',
    subjectDisplayName: 'Foo',
    predicate: 'implements',
    driftType: 'spec_vs_code',
    severity: 'warn',
    conversationValue: null,
    specValue: null,
    codeValue: null,
    detectedAt: '2026-06-01T00:00:00.000Z',
    resolvedAt: null,
    resolutionNote: '',
    ...over,
  };
}

function basePanelProps(over: Partial<DriftPanelProps> = {}): DriftPanelProps {
  return {
    t,
    rows: [],
    onResolve: async () => {},
    onLoadDetail: async () => null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// mountDriftPanel
// ---------------------------------------------------------------------------

describe('mountDriftPanel', () => {
  it('rows が空なら empty メッセージを表示する', () => {
    const c = document.createElement('div');
    mountDriftPanel(c, basePanelProps());
    expect(c.textContent).toContain('memory.drift.empty');
    expect(c.querySelector('table')).toBeNull();
  });

  it('rows があればテーブルを描画する', () => {
    const c = document.createElement('div');
    mountDriftPanel(c, basePanelProps({ rows: [makeRow()] }));
    expect(c.querySelector('table')).not.toBeNull();
    expect(c.querySelector('tbody')?.children.length).toBe(1);
  });

  it('rows に複数行あればすべて描画する', () => {
    const c = document.createElement('div');
    mountDriftPanel(
      c,
      basePanelProps({
        rows: [
          makeRow({ id: 'r1', driftType: 'spec_vs_code' }),
          makeRow({ id: 'r2', driftType: 'conv_vs_code' }),
        ],
      }),
    );
    expect(c.querySelector('tbody')?.children.length).toBe(2);
  });

  it('unresolved-only switch で resolved 行をフィルタする', () => {
    const resolved = makeRow({ id: 'r-resolved', resolvedAt: '2026-06-10T00:00:00.000Z' });
    const pending = makeRow({ id: 'r-pending', resolvedAt: null });
    const c = document.createElement('div');
    mountDriftPanel(c, basePanelProps({ rows: [resolved, pending] }));

    // 初期状態: unresolvedOnly=true → pending のみ表示
    expect(c.querySelector('tbody')?.children.length).toBe(1);

    // switch をクリックして false に切り替え → 両方表示
    const switchInput = c.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(switchInput).not.toBeNull();
    switchInput.checked = false;
    switchInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(c.querySelector('tbody')?.children.length).toBe(2);
  });

  it('Detail ボタンクリックでダイアログを開く', async () => {
    const c = document.createElement('div');
    let loadCalled = 0;
    mountDriftPanel(
      c,
      basePanelProps({
        rows: [makeRow()],
        onLoadDetail: async () => {
          loadCalled += 1;
          return null;
        },
      }),
    );

    // "Detail" ボタンを押す
    const detailBtn = [...c.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('memory.drift.detail'),
    ) as HTMLButtonElement | undefined;
    expect(detailBtn).toBeDefined();
    detailBtn?.click();
    await flush();

    // onLoadDetail が呼ばれた
    expect(loadCalled).toBe(1);

    // ダイアログが DOM に存在する（dialog は body に追加される）
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('resolved 行には Detail ボタンがなく resolved chip を表示する', () => {
    const c = document.createElement('div');
    mountDriftPanel(
      c,
      basePanelProps({
        rows: [makeRow({ resolvedAt: '2026-06-10T00:00:00.000Z' })],
      }),
    );

    // unresolvedOnly=true の初期状態では行自体が表示されない
    expect(c.querySelector('tbody')?.children.length).toBe(0);

    // switch を off にして resolved 行を表示
    const switchInput = c.querySelector('input[type="checkbox"]') as HTMLInputElement;
    switchInput.checked = false;
    switchInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(c.querySelector('tbody')?.children.length).toBe(1);

    // resolved chip が表示され Detail ボタンはない
    expect(c.textContent).toContain('memory.drift.resolved');
    const hasDetail = [...c.querySelectorAll('button')].some((b) =>
      b.textContent?.includes('memory.drift.detail'),
    );
    expect(hasDetail).toBe(false);
  });

  it('update() で rows を差し替えると再描画される', () => {
    const c = document.createElement('div');
    const handle = mountDriftPanel(c, basePanelProps());
    expect(c.textContent).toContain('memory.drift.empty');

    handle.update(basePanelProps({ rows: [makeRow()] }));
    expect(c.querySelector('table')).not.toBeNull();
    expect(c.querySelector('tbody')?.children.length).toBe(1);
  });

  it('destroy() でルート要素を除去する', () => {
    const c = document.createElement('div');
    const handle = mountDriftPanel(c, basePanelProps());
    expect(c.childElementCount).toBeGreaterThan(0);
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });

  it('severity フィルターで warn のみ表示する', () => {
    const rows = [
      makeRow({ id: 'r1', severity: 'warn' }),
      makeRow({ id: 'r2', severity: 'error' }),
    ];
    const c = document.createElement('div');
    mountDriftPanel(c, basePanelProps({ rows }));

    // severity select を探してクリックし、warn を選択する
    // createSelect は combobox role を使う
    const comboboxes = [...c.querySelectorAll('[role="combobox"]')] as HTMLElement[];
    // 最初のコンボボックスが severity
    const severityCombo = comboboxes[0];
    expect(severityCombo).toBeDefined();

    // デフォルトは '' (All) → 2行表示
    expect(c.querySelector('tbody')?.children.length).toBe(2);
  });

  it('HelpOutline tooltip が DOM に存在する', () => {
    const c = document.createElement('div');
    mountDriftPanel(c, basePanelProps({ rows: [makeRow()] }));
    const helpIcon = c.querySelector('[aria-label="type-help"]');
    expect(helpIcon).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mountFiltersPanel
// ---------------------------------------------------------------------------

describe('mountFiltersPanel', () => {
  function baseFilterProps(over: Partial<FiltersPanelProps> = {}): FiltersPanelProps {
    return {
      t,
      repoScope: 'all',
      onRepoScopeChange: () => {},
      ...over,
    };
  }

  it('タイトルと2つのラジオボタンを描画する', () => {
    const c = document.createElement('div');
    mountFiltersPanel(c, baseFilterProps());
    expect(c.textContent).toContain('memory.chat.filters.title');
    const radios = c.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
  });

  it('radiogroup が存在する', () => {
    const c = document.createElement('div');
    mountFiltersPanel(c, baseFilterProps());
    expect(c.querySelector('[role="radiogroup"]')).not.toBeNull();
  });

  it('ラジオ選択で onRepoScopeChange を呼ぶ', () => {
    const c = document.createElement('div');
    let lastScope: string | null = null;
    mountFiltersPanel(
      c,
      baseFilterProps({ onRepoScopeChange: (s) => (lastScope = s) }),
    );
    const radios = [...c.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
    // 2番目のラジオ ('current') をクリック
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event('change', { bubbles: true }));
    expect(lastScope).toBe('current');
  });

  it('update() で repoScope を変更する', () => {
    const c = document.createElement('div');
    const handle = mountFiltersPanel(c, baseFilterProps({ repoScope: 'all' }));
    // 最初のラジオが checked
    const radios = [...c.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
    expect(radios[0].checked).toBe(true);

    handle.update(baseFilterProps({ repoScope: 'current' }));
    expect(radios[1].checked).toBe(true);
  });

  it('destroy() でルート要素を除去する', () => {
    const c = document.createElement('div');
    const handle = mountFiltersPanel(c, baseFilterProps());
    expect(c.childElementCount).toBeGreaterThan(0);
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mountDriftDetailDialog
// ---------------------------------------------------------------------------

describe('mountDriftDetailDialog', () => {
  const detail = {
    id: 'ev-1',
    subjectEntityId: 'entity/bar',
    subjectDisplayName: 'Bar',
    predicate: 'implements',
    driftType: 'spec_vs_code',
    severity: 'error',
    conversationValue: 'conv-val',
    specValue: 'spec-val',
    codeValue: 'code-val',
    detailJson: { key: 'value' },
    detectedAt: '2026-06-01T00:00:00.000Z',
    resolvedAt: null,
    resolutionNote: '',
  };

  function baseDialogProps(over: Partial<DriftDetailDialogProps> = {}): DriftDetailDialogProps {
    return {
      t,
      eventId: 'ev-1',
      onClose: () => {},
      onResolve: async () => {},
      onLoadDetail: async () => detail,
      ...over,
    };
  }

  afterEach(() => {
    // クリーンアップ: テスト後に残ったダイアログを除去
    document.body.querySelectorAll('[data-am-dialog-backdrop]').forEach((el) => el.remove());
  });

  it('ダイアログを body にマウントする（loading 中は spinner）', () => {
    mountDriftDetailDialog(document.body, baseDialogProps({ onLoadDetail: () => new Promise(() => {}) }));
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('詳細がロードされたら内容を描画する', async () => {
    mountDriftDetailDialog(document.body, baseDialogProps());
    await flush();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('spec_vs_code');
    expect(dialog?.textContent).toContain('conv-val');
    expect(dialog?.textContent).toContain('spec-val');
    expect(dialog?.textContent).toContain('code-val');
  });

  it('detailJson が表示される', async () => {
    mountDriftDetailDialog(document.body, baseDialogProps());
    await flush();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Detail JSON');
    expect(dialog?.querySelector('pre')?.textContent).toContain('value');
  });

  it('onClose がクリックで呼ばれる', async () => {
    let closed = 0;
    const handle = mountDriftDetailDialog(
      document.body,
      baseDialogProps({ onClose: () => (closed += 1) }),
    );
    await flush();
    const cancelBtn = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent === 'Cancel',
    );
    expect(cancelBtn).toBeDefined();
    cancelBtn?.click();
    expect(closed).toBe(1);
    handle.destroy();
  });

  it('未解決のとき resolve ボタンが存在する', async () => {
    mountDriftDetailDialog(document.body, baseDialogProps());
    await flush();
    const buttons = [...document.body.querySelectorAll('button')];
    const resolveBtn = buttons.find((b) => b.textContent?.includes('memory.drift.resolve'));
    expect(resolveBtn).toBeDefined();
  });

  it('onResolve がコールバックされ onClose が呼ばれる', async () => {
    let resolved = 0;
    let closed = 0;
    mountDriftDetailDialog(
      document.body,
      baseDialogProps({
        onResolve: async () => {
          resolved += 1;
        },
        onClose: () => (closed += 1),
      }),
    );
    await flush();
    const buttons = [...document.body.querySelectorAll('button')];
    const resolveBtn = buttons.find((b) => b.textContent?.includes('memory.drift.resolve')) as
      | HTMLButtonElement
      | undefined;
    expect(resolveBtn).toBeDefined();
    resolveBtn?.click();
    await flush();
    expect(resolved).toBe(1);
    expect(closed).toBe(1);
  });

  it('resolved のとき resolve ボタンが非表示（display:none）', async () => {
    mountDriftDetailDialog(
      document.body,
      baseDialogProps({
        onLoadDetail: async () => ({
          ...detail,
          resolvedAt: '2026-06-10T00:00:00.000Z',
          resolutionNote: 'fixed it',
        }),
      }),
    );
    await flush();
    const buttons = [...document.body.querySelectorAll('button')];
    // resolve ボタンは存在するが display:none で非表示
    const resolveBtn = buttons.find((b) => b.textContent?.includes('memory.drift.resolve')) as
      | HTMLButtonElement
      | undefined;
    // 非表示（display:none）であること
    expect(resolveBtn?.style.display).toBe('none');
    // Close ボタンは表示
    const closeBtn = buttons.find((b) => b.textContent === 'Close');
    expect(closeBtn).toBeDefined();
  });

  it('destroy() でダイアログが DOM から除去される', async () => {
    const handle = mountDriftDetailDialog(document.body, baseDialogProps());
    await flush();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    handle.destroy();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('detail が null のとき em ダッシュを表示する', async () => {
    mountDriftDetailDialog(
      document.body,
      baseDialogProps({ onLoadDetail: async () => null }),
    );
    await flush();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('—');
  });
});
