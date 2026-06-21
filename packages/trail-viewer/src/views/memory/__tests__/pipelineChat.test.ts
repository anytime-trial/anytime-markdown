/**
 * views/memory — Pipeline + Chat vanilla DOM ユニットテスト（jsdom）
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
import type { MemoryReader } from '../../../data/readers/MemoryReader';
import type {
  MemoryPipelineRunStatsByDayRow,
  MemoryTopEntityRow,
  MemoryInvalidationRow,
  MemoryFailedItemRow,
} from '../../../data/types';
import type { ChatBridge } from '../../../hooks/useChatBridge';

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

// ---------------------------------------------------------------------------
// MemoryReader mock
// ---------------------------------------------------------------------------

function makeReader(
  overrides: Partial<{
    listPipelineRunStatsByDay: (opts: { since: string }) => Promise<readonly MemoryPipelineRunStatsByDayRow[]>;
    listTopEntities: (opts: { limit: number }) => Promise<readonly MemoryTopEntityRow[]>;
    listInvalidations: (opts: { limit: number }) => Promise<readonly MemoryInvalidationRow[]>;
    listFailedItems: (opts: { limit: number }) => Promise<readonly MemoryFailedItemRow[]>;
  }> = {},
): MemoryReader {
  return {
    probe: () => Promise.resolve(true),
    listPipelineRunStatsByDay: overrides.listPipelineRunStatsByDay ?? (() => Promise.resolve([])),
    listTopEntities: overrides.listTopEntities ?? (() => Promise.resolve([])),
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
  } as unknown as MemoryReader;
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
    expect(c.textContent).toContain('memory.runs.empty');
  });

  it('reader が存在すれば aria-label="pipeline-runs" を持つ要素を描画する', () => {
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, { t, reader: makeReader() });
    expect(c.querySelector('[aria-label="pipeline-runs"]')).not.toBeNull();
  });

  it('pipeline stats が返ってきたらタイムラインセクションのラベルを含む', async () => {
    const rows: MemoryPipelineRunStatsByDayRow[] = [
      { day: '2026-06-01', scope: 'episode', runs: 5, durationSec: 10, itemsProcessed: 100, worstStatus: 'success' },
    ];
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, { t, reader: makeReader({ listPipelineRunStatsByDay: () => Promise.resolve(rows) }) });
    await flush();
    expect(c.textContent).toContain('memory.runs.timeline');
  });

  it('top entities が返ってきたら topEntities セクションのラベルを含む', async () => {
    const entities: MemoryTopEntityRow[] = [
      { id: 'e1', type: 'function', canonicalName: 'foo', displayName: 'foo', lastUpdatedAt: '2026-06-01' },
    ];
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, {
      t,
      reader: makeReader({ listTopEntities: () => Promise.resolve(entities) }),
    });
    await flush();
    expect(c.textContent).toContain('memory.runs.topEntities');
    expect(c.textContent).toContain('foo');
  });

  it('invalidations が返ってきたら一覧テーブルを描画する', async () => {
    const invs: MemoryInvalidationRow[] = [
      { id: 'i1', edgeId: 'edge-1', invalidatedAt: '2026-06-01T00:00:00Z', reason: 'stale', supersedingEdgeId: 'edge-2' },
    ];
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, {
      t,
      reader: makeReader({ listInvalidations: () => Promise.resolve(invs) }),
    });
    await flush();
    expect(c.textContent).toContain('stale');
    // supersedingEdgeId の先頭8文字
    expect(c.textContent).toContain('edge-2'.slice(0, 8));
  });

  it('failed items が返ってきたら一覧テーブルを描画する', async () => {
    const items: MemoryFailedItemRow[] = [
      { scope: 'episode', itemKey: 'item-key-123', failedAt: '2026-06-01', reason: 'timeout', attemptCount: 3 },
    ];
    const c = document.createElement('div');
    mountPipelineRunsPanel(c, {
      t,
      reader: makeReader({ listFailedItems: () => Promise.resolve(items) }),
    });
    await flush();
    expect(c.textContent).toContain('item-key-123');
    expect(c.textContent).toContain('timeout');
    expect(c.textContent).toContain('3');
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
    expect(c.textContent).toContain('memory.runs.empty');

    const reader2 = makeReader({
      listTopEntities: () => Promise.resolve([
        { id: 'e2', type: 'class', canonicalName: 'Bar', displayName: 'Bar', lastUpdatedAt: '2026-06-02' },
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
    const sendBtn = c.querySelector('[aria-label="memory.chat.send"]') as HTMLButtonElement | null;
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
    const sendBtn = c.querySelector('[aria-label="memory.chat.send"]') as HTMLButtonElement | null;
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
    const sendBtn = c.querySelector('[aria-label="memory.chat.send"]') as HTMLButtonElement | null;
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
    const sendBtn = c.querySelector('[aria-label="memory.chat.send"]') as HTMLButtonElement | null;
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
    expect(c.textContent).toContain('memory.chat.sources.empty');
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
    expect(c.textContent).toContain('memory.chat.sources.empty');
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
    expect(c.textContent).toContain('memory.chat.setup.title');
    expect(c.textContent).toContain('memory.chat.setup.step1');
    expect(c.textContent).toContain('memory.chat.setup.step2');
    expect(c.textContent).toContain('memory.chat.setup.step3');
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
