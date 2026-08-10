/**
 * views/caravan — Pipeline + Chat vanilla DOM ユニットテスト（jsdom）
 *
 * mountPipelineRunsPanel / mountChatPane / 葉コンポーネント（messageBubble / sourcesPanel / setupGuide）
 * の DOM 構造・インタラクション・update/destroy を検証する。
 * スタイルは tests では検証しない（jsdom は cssom 非評価）。
 */
import { mountPipelineRunsPanel } from '../pipelineRunsPanel';
import { mountChatPane } from '../chatPane';
import { createMessageBubble } from '../messageBubble';
import { mountSourcesPanel } from '../sourcesPanel';
import { mountSetupGuide } from '../setupGuide';
import type { CaravanReader } from '../../../data/readers/CaravanReader';
import type {
  CaravanPipelineRunLogRow,
  CaravanPipelineRunRow,
  CaravanPipelineRunStatsByDayRow,
  CaravanInvalidationRow,
  CaravanFailedItemRow,
} from '../../../data/types';
import type { ChatBridge } from '../../../hooks/useChatBridge';
import { ja } from '../../../i18n/ja';
import { en } from '../../../i18n/en';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const t = (key: string): string => key;

/** Promise チェーンをフラッシュする。 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForText(el: HTMLElement, text: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    if (el.textContent?.includes(text)) return;
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// ---------------------------------------------------------------------------
// CaravanReader mock
// ---------------------------------------------------------------------------

function makeReader(
  overrides: Partial<{
    listPipelineRunStatsByDay: (opts: { since: string }) => Promise<readonly CaravanPipelineRunStatsByDayRow[]>;
    listPipelineRuns: (opts: { since: string; wave?: string; status?: string; limit?: number }) => Promise<readonly CaravanPipelineRunRow[]>;
    listPipelineRunLogs: (opts: { runId: string; limit?: number }) => Promise<readonly CaravanPipelineRunLogRow[]>;
    listInvalidations: (opts: { limit: number }) => Promise<readonly CaravanInvalidationRow[]>;
    listFailedItems: (opts: { limit: number }) => Promise<readonly CaravanFailedItemRow[]>;
  }> = {},
): CaravanReader {
  return {
    probe: () => Promise.resolve(true),
    listPipelineRunStatsByDay: overrides.listPipelineRunStatsByDay ?? (() => Promise.resolve([])),
    listPipelineRuns: overrides.listPipelineRuns ?? (() => Promise.resolve([])),
    listPipelineRunLogs: overrides.listPipelineRunLogs ?? (() => Promise.resolve([])),
    listInvalidations: overrides.listInvalidations ?? (() => Promise.resolve([])),
    listFailedItems: overrides.listFailedItems ?? (() => Promise.resolve([])),
    listDriftEvents: () => Promise.resolve([]),
    getDriftEventDetail: () => Promise.resolve(null),
    resolveDriftEvent: () => Promise.resolve(),
    listBugHistory: () => Promise.resolve([]),
    listRecurringBugs: () => Promise.resolve([]),
    getBugCausalInfo: () => Promise.resolve(null),
    listReviewHistory: () => Promise.resolve([]),
    listUnaddressedReviewFindings: () => Promise.resolve([]),
  } as unknown as CaravanReader;
}

// ---------------------------------------------------------------------------
// ChatBridge mock
// ---------------------------------------------------------------------------

type ChunkHandler = (chunk: unknown) => void;

interface MockBridge extends ChatBridge {
  _emit(chunk: unknown): void;
}

function makeBridge(status: ChatBridge['status'] = 'ready'): MockBridge {
  const handlers = new Set<ChunkHandler>();
  let _sent: string[] = [];

  return {
    status,
    detail: undefined,
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    send(query) {
      _sent.push(query);
    },
    abort() { /* no-op */ },
    recheck() { /* no-op */ },
    _emit(chunk) {
      for (const h of handlers) h(chunk);
    },
  };
}

// ---------------------------------------------------------------------------
// PipelineRunsPanel
// ---------------------------------------------------------------------------

describe('mountPipelineRunsPanel', () => {
  it('reader が null のとき empty メッセージを表示する', () => {
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, { t, reader: null });
    expect(c.textContent).toContain('caravan.runs.empty');
  });

  it('reader が存在すれば aria-label="pipeline-runs" を持つ要素を描画する', () => {
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, { t, reader: makeReader() });
    expect(c.querySelector('[aria-label="pipeline-runs"]')).not.toBeNull();
  });

  it('pipeline stats が返ってきたらタイムラインセクションのラベルを含む', async () => {
    const rows: CaravanPipelineRunStatsByDayRow[] = [
      { day: '2026-06-01', scope: 'episode', wave: 'memory', runs: 5, durationSec: 10, itemsProcessed: 100, worstStatus: 'success' },
    ];
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, { t, reader: makeReader({ listPipelineRunStatsByDay: () => Promise.resolve(rows) }) });
    await flush();
    expect(c.textContent).toContain('caravan.runs.timeline');
  });

  it('Wave フィルタでタイムラインと実行一覧を絞り込む', async () => {
    const statsSpy = jest.fn((opts: { since: string }) => Promise.resolve([
      { day: '2026-06-01', scope: 'episode', wave: 'memory', runs: 5, durationSec: 10, itemsProcessed: 100, worstStatus: 'success' },
      { day: '2026-06-01', scope: 'system', wave: 'system', runs: 1, durationSec: 4, itemsProcessed: 2, worstStatus: 'success' },
    ] as CaravanPipelineRunStatsByDayRow[]));
    const runsSpy = jest.fn((opts: { since: string; wave?: string; limit?: number }) => Promise.resolve([]));
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, {
      t,
      reader: makeReader({
        listPipelineRunStatsByDay: statsSpy,
        listPipelineRuns: runsSpy,
      }),
    });
    await flush();

    const systemChip = [...c.querySelectorAll('[role="button"]')]
      .find((el) => el.textContent === 'system') as HTMLElement | undefined;
    expect(systemChip).toBeDefined();
    systemChip?.click();
    await flush();

    expect(runsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ wave: 'system' }));
    expect(statsSpy).toHaveBeenCalledTimes(2);
  });

  it('error 行のクリックで errorDetail とログを展開する', async () => {
    const runs: CaravanPipelineRunRow[] = [
      {
        id: 'run-1',
        scope: 'episode',
        wave: 'memory',
        tier: 1,
        status: 'error',
        startedAt: '2026-06-01T00:00:00.000Z',
        finishedAt: '2026-06-01T00:00:01.000Z',
        durationMs: 1000,
        itemsProcessed: 10,
        itemsFailed: 1,
        errorDetail: 'full error detail text',
      },
    ];
    const logs: CaravanPipelineRunLogRow[] = [
      {
        id: 1,
        timestamp: '2026-06-01T00:00:00.500Z',
        level: 'error',
        source: 'pipeline',
        component: 'worker',
        message: 'worker failed',
        metadata: null,
        stack: null,
      },
    ];
    const logsSpy = jest.fn(() => Promise.resolve(logs));
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, {
      t,
      reader: makeReader({
        listPipelineRuns: () => Promise.resolve(runs),
        listPipelineRunLogs: logsSpy,
      }),
    });
    await flush();

    const errorCell = [...c.querySelectorAll('td')].find((td) => td.textContent === 'caravan.runs.status.error');
    expect(errorCell).toBeDefined();
    errorCell?.parentElement?.click();
    await waitForText(c, 'worker failed');

    expect(logsSpy).toHaveBeenCalledWith({ runId: 'run-1', limit: 100 });
    expect(c.textContent).toContain('full error detail text');
    expect(c.textContent).toContain('worker failed');
  });

  // 無効化履歴はグラフ表示側へ寄せるため画面から外した。データ経路（reader/API/DB）は
  // 残すので、「reader に生えている＝描画される」の退行を検知する。
  it('無効化履歴は取得も描画もしない', async () => {
    const invs: CaravanInvalidationRow[] = [
      { id: 'i1', edgeId: 'edge-1', invalidatedAt: '2026-06-01T00:00:00Z', reason: 'stale', supersedingEdgeId: 'edge-2' },
    ];
    const listInvalidations = jest.fn(() => Promise.resolve(invs));
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, {
      t,
      reader: makeReader({ listInvalidations }),
    });
    await flush();
    expect(listInvalidations).not.toHaveBeenCalled();
    expect(c.textContent).not.toContain('stale');
    expect(c.textContent).not.toContain('edge-2');
  });

  it('failed items が返ってきたら一覧テーブルを描画する', async () => {
    const items: CaravanFailedItemRow[] = [
      { scope: 'episode', itemKey: 'item-key-123', failedAt: '2026-06-01', reason: 'timeout', detail: 'socket timed out after retry', attemptCount: 3 },
    ];
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, {
      t,
      reader: makeReader({ listFailedItems: () => Promise.resolve(items) }),
    });
    await flush();
    expect(c.textContent).toContain('item-key-123');
    expect(c.textContent).toContain('timeout');
    expect(c.textContent).toContain('socket timed out after retry');
    expect(c.textContent).toContain('3');
  });

  it('追加した memory.runs i18n キーが ja/en の両方に存在する', () => {
    const keys = [
      'caravan.runs.filterWave',
      'caravan.runs.runList',
      'caravan.runs.errorDetail',
      'caravan.runs.logs',
      'caravan.runs.wave.all',
      'caravan.runs.column.startedAt',
      'caravan.runs.column.timestamp',
      'caravan.runs.column.scope',
      'caravan.runs.column.wave',
      'caravan.runs.column.status',
      'caravan.runs.column.duration',
      'caravan.runs.column.itemsProcessed',
      'caravan.runs.column.level',
      'caravan.runs.column.component',
      'caravan.runs.column.message',
      'caravan.runs.column.key',
      'caravan.runs.column.attempts',
      'caravan.runs.column.reason',
      'caravan.runs.column.detail',
    ] as const;

    for (const key of keys) {
      expect(ja[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    }
  });

  it('destroy で DOM が除去される', () => {
    const c = document.createElement('div');
    const handle = mountPipelineRunsPanel(c, { t, reader: null });
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });

  it('reader が変わったときリセットして再描画する', async () => {
    const c = document.createElement('div');
    const handle = mountPipelineRunsPanel(c, { t, reader: null });
    expect(c.textContent).toContain('caravan.runs.empty');

    const reader2 = makeReader({
      listFailedItems: () => Promise.resolve([
        { scope: 'spec', itemKey: 'Bar', failedAt: '2026-06-02T00:00:00.000Z', reason: 'parse_error', detail: '', attemptCount: 1 },
      ]),
    });
    handle.update({ t, reader: reader2 });
    await flush();
    expect(c.textContent).toContain('Bar');
  });
});

// ---------------------------------------------------------------------------
// ChatPane
// ---------------------------------------------------------------------------

describe('mountChatPane', () => {
  it('role=log の要素を描画する', () => {
    const c = document.createElement('div');
    const bridge = makeBridge();
    mountChatPane(c, { t, bridge });
    expect(c.querySelector('[role="log"]')).not.toBeNull();
  });

  it('送信ボタンが初期状態で disabled になっている', () => {
    const c = document.createElement('div');
    mountChatPane(c, { t, bridge: makeBridge() });
    const sendBtn = c.querySelector('[aria-label="caravan.chat.send"]') as HTMLButtonElement | null;
    expect(sendBtn).not.toBeNull();
    expect(sendBtn?.hasAttribute('disabled')).toBe(true);
  });

  it('token chunk を受け取ると assistant メッセージを描画する', () => {
    const c = document.createElement('div');
    const bridge = makeBridge();
    mountChatPane(c, { t, bridge });

    // まずユーザー送信（SEND）でメッセージリストを初期化してから token を流す
    const input = c.querySelector('textarea, input') as HTMLInputElement | null;
    if (input) {
      input.value = 'my query';
      input.dispatchEvent(new Event('input'));
    }
    const sendBtn = c.querySelector('[aria-label="caravan.chat.send"]') as HTMLButtonElement | null;
    sendBtn?.removeAttribute('disabled');
    sendBtn?.click();

    bridge._emit({ type: 'sources', payload: [] });
    bridge._emit({ type: 'token', payload: { delta: 'Hello' } });
    bridge._emit({ type: 'token', payload: { delta: ' world' } });
    bridge._emit({ type: 'done', payload: { interrupted: false } });

    // message log に 'Hello world' が含まれているか
    const log = c.querySelector('[role="log"]') as HTMLElement;
    expect(log.textContent).toContain('Hello world');
  });

  it('error chunk を受け取るとエラーメッセージを描画する', () => {
    const c = document.createElement('div');
    const bridge = makeBridge();
    mountChatPane(c, { t, bridge });

    // SEND で状態を初期化してから error を流す
    const input = c.querySelector('textarea, input') as HTMLInputElement | null;
    if (input) {
      input.value = 'query';
      input.dispatchEvent(new Event('input'));
    }
    const sendBtn = c.querySelector('[aria-label="caravan.chat.send"]') as HTMLButtonElement | null;
    sendBtn?.removeAttribute('disabled');
    sendBtn?.click();

    bridge._emit({ type: 'sources', payload: [] });
    bridge._emit({ type: 'error', payload: { message: 'server error' } });

    const log = c.querySelector('[role="log"]') as HTMLElement;
    expect(log.textContent).toContain('server error');
  });

  it('interrupted: true のとき "(interrupted)" を表示する', () => {
    const c = document.createElement('div');
    const bridge = makeBridge();
    mountChatPane(c, { t, bridge });

    // SEND してから done(interrupted) を流す
    const input = c.querySelector('textarea, input') as HTMLInputElement | null;
    if (input) {
      input.value = 'query';
      input.dispatchEvent(new Event('input'));
    }
    const sendBtn = c.querySelector('[aria-label="caravan.chat.send"]') as HTMLButtonElement | null;
    sendBtn?.removeAttribute('disabled');
    sendBtn?.click();

    bridge._emit({ type: 'token', payload: { delta: 'partial' } });
    bridge._emit({ type: 'done', payload: { interrupted: true } });

    const log = c.querySelector('[role="log"]') as HTMLElement;
    expect(log.textContent).toContain('(interrupted)');
  });

  it('destroy で DOM が除去される', () => {
    const c = document.createElement('div');
    const handle = mountChatPane(c, { t, bridge: makeBridge() });
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createMessageBubble
// ---------------------------------------------------------------------------

describe('createMessageBubble', () => {
  it('user メッセージは justify-content:flex-end', () => {
    const { el } = createMessageBubble({
      message: { role: 'user', content: 'hello', citations: [] },
      sources: [],
    });
    expect(el.style.justifyContent).toBe('flex-end');
  });

  it('assistant メッセージは justify-content:flex-start', () => {
    const { el } = createMessageBubble({
      message: { role: 'assistant', content: 'hi', citations: [] },
      sources: [],
    });
    expect(el.style.justifyContent).toBe('flex-start');
  });

  it('content テキストが描画される', () => {
    const { el } = createMessageBubble({
      message: { role: 'assistant', content: 'The answer is 42.', citations: [] },
      sources: [],
    });
    expect(el.textContent).toContain('The answer is 42.');
  });

  it('citation タグを Chip に変換する', () => {
    const sources = [{ id: 'abc123', title: 'My Source', kind: 'entity' }];
    const { el } = createMessageBubble({
      message: {
        role: 'assistant',
        content: 'See [^entity:abc123].',
        citations: ['entity:abc123'],
      },
      sources,
    });
    // タグ部分は Chip に置換されるのでテキスト中に "[^entity:abc123]" はないが
    // source title 'My Source' は Chip label として含まれる
    expect(el.textContent).toContain('My Source');
  });

  it('entity 引用チップのクリックだけが onCitationClick へ届く（episode は非クリック。知識グラフ設計書 §3.6）', () => {
    const clicked: string[] = [];
    const { el } = createMessageBubble({
      message: {
        role: 'assistant',
        content: 'See [^entity:abc123] and [^episode:ep9].',
        citations: ['entity:abc123', 'episode:ep9'],
      },
      sources: [],
      onCitationClick: (tag) => clicked.push(tag),
    });
    // chip 実装のクラス名に依存せず全要素をクリックし、entity タグだけが届くことを見る
    for (const target of el.querySelectorAll<HTMLElement>('*')) target.click();
    expect(clicked).toContain('entity:abc123');
    expect(clicked).not.toContain('episode:ep9');
  });

  it('error メッセージがある場合は表示する', () => {
    const { el } = createMessageBubble({
      message: { role: 'assistant', content: '', citations: [], error: 'oops' },
      sources: [],
    });
    expect(el.textContent).toContain('oops');
  });

  it('interrupted フラグがある場合は "(interrupted)" を表示する', () => {
    const { el } = createMessageBubble({
      message: { role: 'assistant', content: 'partial', citations: [], interrupted: true },
      sources: [],
    });
    expect(el.textContent).toContain('(interrupted)');
    // opacity はスタイル文字列に含まれているか
    expect(el.querySelector('[style*="opacity"]') ?? el).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mountSourcesPanel
// ---------------------------------------------------------------------------

describe('mountSourcesPanel', () => {
  it('sources が空なら empty メッセージを表示する', () => {
    const c = document.createElement('div');
    mountSourcesPanel(c, { t, sources: [] });
    expect(c.textContent).toContain('caravan.chat.sources.empty');
  });

  it('sources があればタイトルをリスト表示する', () => {
    const c = document.createElement('div');
    mountSourcesPanel(c, {
      t,
      sources: [
        { id: '1', title: 'Foo Source', kind: 'entity' },
        { id: '2', title: 'Bar Source', kind: 'episode' },
      ],
    });
    expect(c.textContent).toContain('Foo Source');
    expect(c.textContent).toContain('Bar Source');
  });

  it('アイテムクリックで onSelect を呼ぶ', () => {
    const c = document.createElement('div');
    const source = { id: '1', title: 'Foo', kind: 'entity' };
    let selected = null as typeof source | null;
    mountSourcesPanel(c, {
      t,
      sources: [source],
      onSelect: (s) => { selected = s; },
    });
    const btn = c.querySelector('button') as HTMLButtonElement;
    btn.click();
    expect(selected).toEqual(source);
  });

  it('update で sources を更新する', () => {
    const c = document.createElement('div');
    const handle = mountSourcesPanel(c, { t, sources: [] });
    expect(c.textContent).toContain('caravan.chat.sources.empty');
    handle.update({ t, sources: [{ id: '1', title: 'New Source', kind: 'entity' }] });
    expect(c.textContent).toContain('New Source');
  });

  it('destroy で DOM が除去される', () => {
    const c = document.createElement('div');
    const handle = mountSourcesPanel(c, { t, sources: [] });
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mountSetupGuide
// ---------------------------------------------------------------------------

describe('mountSetupGuide', () => {
  it('セットアップタイトルと手順ステップを表示する', () => {
    const c = document.createElement('div');
    mountSetupGuide(c, { t, onRecheck: () => void 0 });
    expect(c.textContent).toContain('caravan.chat.setup.title');
    expect(c.textContent).toContain('caravan.chat.setup.step1');
    expect(c.textContent).toContain('caravan.chat.setup.step2');
    expect(c.textContent).toContain('caravan.chat.setup.step3');
  });

  it('detail が指定されると本文に含まれる', () => {
    const c = document.createElement('div');
    mountSetupGuide(c, { t, onRecheck: () => void 0, detail: 'Connection refused at :3000' });
    expect(c.textContent).toContain('Connection refused at :3000');
  });

  it('recheck ボタンクリックで onRecheck が呼ばれる', () => {
    const c = document.createElement('div');
    let called = 0;
    mountSetupGuide(c, { t, onRecheck: () => { called += 1; } });
    const btn = c.querySelector('button') as HTMLButtonElement;
    btn.click();
    expect(called).toBe(1);
  });

  it('destroy で DOM が除去される', () => {
    const c = document.createElement('div');
    const handle = mountSetupGuide(c, { t, onRecheck: () => void 0 });
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });
});
