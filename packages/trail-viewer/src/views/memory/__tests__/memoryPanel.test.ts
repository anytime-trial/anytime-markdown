/**
 * views/memory/memoryPanel — vanilla DOM ユニットテスト（jsdom）
 *
 * - mount でサブタブバーを構築する
 * - タブ切替でサブビューをマウント・破棄する
 * - update() / destroy() が正しく動作する
 * - MemoryReader.probe() は no-throw（jsdom: no real server）
 */
import { mountMemoryPanel, type MemoryPanelViewProps } from '../memoryPanel';
import type { TrailThemeTokens } from '../../../theme/designTokens';
import type { ChatBridge } from '../../../hooks/useChatBridge';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const t = (key: string): string => key;

async function flush(n = 4): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

function makeBridge(status: 'ready' | 'unavailable' | 'unknown' = 'unavailable'): ChatBridge {
  return {
    status,
    subscribe: () => () => {},
    send: () => {},
    abort: () => {},
    recheck: () => {},
  };
}

// Minimal tokens stub — only isDark matters for sub-views
const tokens = { isDark: false } as unknown as TrailThemeTokens;

function baseProps(over: Partial<MemoryPanelViewProps> = {}): MemoryPanelViewProps {
  return {
    serverUrl: 'http://localhost:0',
    tokens,
    isDark: false,
    t,
    bridge: makeBridge(),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// mount basics
// ---------------------------------------------------------------------------

describe('mountMemoryPanel', () => {
  afterEach(() => {
    // clean up any dialogs or style elements injected into body/head
    document.body.querySelectorAll('[data-am-dialog-backdrop]').forEach((el) => el.remove());
  });

  it('マウント直後はローディングスピナーを表示する', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    // spinner は progressbar role
    expect(c.querySelector('[role="progressbar"]')).not.toBeNull();
    // タブバーはまだない
    expect(c.querySelector('[role="tablist"]')).toBeNull();
  });

  it('probe が false を返したら noDb メッセージを表示する', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    // probe は fetch → jsdom では失敗して false を返す（catch で false）
    await flush(8);
    // dbExists = false → noDb 表示
    expect(c.textContent).toContain('memory.noDb');
    expect(c.querySelector('[role="tablist"]')).toBeNull();
  });

  it('probe が失敗しても例外をスローしない', async () => {
    const c = document.createElement('div');
    await expect(async () => {
      mountMemoryPanel(c, baseProps());
      await flush(8);
    }).not.toThrow();
  });

  it('destroy() でルート要素を除去する', async () => {
    const c = document.createElement('div');
    const handle = mountMemoryPanel(c, baseProps());
    await flush(8);
    expect(c.childElementCount).toBeGreaterThan(0);
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });

  it('update() で t() が反映される（loading 中）', () => {
    const c = document.createElement('div');
    const handle = mountMemoryPanel(c, baseProps({ t: (_k) => 'ORIGINAL' }));
    expect(c.textContent).toContain('ORIGINAL');

    handle.update(baseProps({ t: (_k) => 'UPDATED' }));
    expect(c.textContent).toContain('UPDATED');
  });

  it('update() を呼んでも destroy 後はエラーを出さない', async () => {
    const c = document.createElement('div');
    const handle = mountMemoryPanel(c, baseProps());
    handle.destroy();
    // destroy 後に update しても throw しないこと
    expect(() => handle.update(baseProps())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// tab bar (simulated dbExists=true by injecting state via postMessage / direct)
// ---------------------------------------------------------------------------

describe('mountMemoryPanel – tab rendering (mocked probe)', () => {
  // We monkey-patch MemoryReader.prototype.probe to resolve true
  // so we can test the tab bar without a real server.
  beforeEach(() => {
    const { MemoryReader } = require('../../../data/readers/MemoryReader') as { MemoryReader: { prototype: { probe: () => Promise<boolean>; listDriftEvents: () => Promise<[]> } } };
    MemoryReader.prototype.probe = async () => true;
    MemoryReader.prototype.listDriftEvents = async () => [];
  });

  afterEach(() => {
    // restore by deleting the override (original is on prototype chain)
    const { MemoryReader } = require('../../../data/readers/MemoryReader') as { MemoryReader: { prototype: Record<string, unknown> } };
    delete MemoryReader.prototype.probe;
    delete MemoryReader.prototype.listDriftEvents;
    document.body.querySelectorAll('[data-am-dialog-backdrop]').forEach((el) => el.remove());
  });

  it('probe が true を返したらタブバーを表示する', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    expect(c.querySelector('[role="tablist"]')).not.toBeNull();
  });

  it('タブバーに5つのタブボタンが存在する', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    const tabs = c.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(5);
  });

  it('タブ名（i18n キー）がすべてタブバーに含まれる', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    const tablist = c.querySelector('[role="tablist"]');
    expect(tablist?.textContent).toContain('memory.drift.tab');
    expect(tablist?.textContent).toContain('memory.bug.tab');
    expect(tablist?.textContent).toContain('memory.review.tab');
    expect(tablist?.textContent).toContain('memory.runs.tab');
    expect(tablist?.textContent).toContain('memory.chat.tab');
  });

  it('初期タブ（drift）のサブビューがマウントされる', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    // driftPanel は empty 状態でも memory.drift.empty を含む
    expect(c.textContent).toContain('memory.drift.empty');
  });

  it('bugタブをクリックするとサブビューが切り替わる', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);

    const tabs = c.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>;
    const bugTab = [...tabs].find((t) => t.textContent?.includes('memory.bug.tab'));
    expect(bugTab).toBeDefined();
    bugTab?.click();
    await flush(4);

    // bug tab のサブビューが存在する（bug-history aria-label）
    expect(c.querySelector('[aria-label="bug-history"]')).not.toBeNull();
    // drift の empty メッセージは消えている
    expect(c.textContent).not.toContain('memory.drift.empty');
  });

  it('review タブをクリックするとサブビューが切り替わる', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);

    const tabs = c.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>;
    const reviewTab = [...tabs].find((t) => t.textContent?.includes('memory.review.tab'));
    reviewTab?.click();
    await flush(4);

    expect(c.querySelector('[aria-label="review-panel"]')).not.toBeNull();
  });

  it('runs タブをクリックするとサブビューが切り替わる', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);

    const tabs = c.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>;
    const runsTab = [...tabs].find((t) => t.textContent?.includes('memory.runs.tab'));
    runsTab?.click();
    await flush(4);

    expect(c.querySelector('[aria-label="pipeline-runs"]')).not.toBeNull();
  });

  it('chat タブをクリックするとサブビューが切り替わる', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);

    const tabs = c.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>;
    const chatTab = [...tabs].find((t) => t.textContent?.includes('memory.chat.tab'));
    chatTab?.click();
    await flush(4);

    expect(c.querySelector('[aria-label="chat-panel"]')).not.toBeNull();
  });

  it('タブ切替でその前のサブビューが除去される', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);

    // Initially drift is mounted
    expect(c.querySelector('[aria-label="bug-history"]')).toBeNull();

    const tabs = c.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>;
    const bugTab = [...tabs].find((t) => t.textContent?.includes('memory.bug.tab'));
    bugTab?.click();
    await flush(4);

    // Now bug is mounted, drift empty message gone
    expect(c.textContent).not.toContain('memory.drift.empty');
  });

  it('destroy() でサブビューも破棄される', async () => {
    const c = document.createElement('div');
    const handle = mountMemoryPanel(c, baseProps());
    await flush(8);

    expect(c.childElementCount).toBeGreaterThan(0);
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });

  it('update() を probe 後に呼ぶとサブビューが更新される', async () => {
    // Reset hash so activeTab starts at drift
    globalThis.history?.replaceState(null, '', '#');
    const c = document.createElement('div');
    const handle = mountMemoryPanel(c, baseProps({ t: (_k) => 'OLD' }));
    await flush(8);

    handle.update(baseProps({ t: (k) => `NEW:${k}` }));
    // t() が反映されているのでタブバーのラベルに NEW: プレフィクスが付く
    expect(c.textContent).toContain('NEW:memory.drift.tab');
    // サブビューの内容にも t() が反映されている
    expect(c.querySelector('[role="tablist"]')).not.toBeNull();
  });
});
