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

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const t = (key: string): string => key;

async function flush(n = 4): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

// Minimal tokens stub — only isDark matters for sub-views
const tokens = { isDark: false } as unknown as TrailThemeTokens;

function baseProps(over: Partial<MemoryPanelViewProps> = {}): MemoryPanelViewProps {
  return {
    serverUrl: 'http://localhost:0',
    tokens,
    isDark: false,
    t,
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

  it('タブバーは Runs だけになる（Chat / Bugs / Reviews / Drift は移設済み）', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    const tabs = c.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(1);
  });

  it('タブ名（i18n キー）がすべてタブバーに含まれる', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    const tablist = c.querySelector('[role="tablist"]');
    expect(tablist?.textContent).toContain('memory.runs.tab');
    // Bugs / Reviews / Drift は Flight Record へ移設済み（Memory には残らない）
    expect(tablist?.textContent).not.toContain('flightRecord.tab.bugfix');
    expect(tablist?.textContent).not.toContain('memory.review.tab');
    expect(tablist?.textContent).not.toContain('flightRecord.tab.drift');
  });

  it('Chat サブタブは残っていない（トップレベルタブへ移設済み）', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    expect(c.querySelector('[aria-label="chat-panel"]')).toBeNull();
    expect(c.querySelector('[data-memory-tab-host="chat"]')).toBeNull();
  });

  it('初期タブ（runs）のサブビューがマウントされる', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    expect(c.querySelector('[aria-label="pipeline-runs"]')).not.toBeNull();
  });

  it('Bugs / Reviews / Drift サブタブは残っていない（Flight Record へ移設済み）', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);

    const tabs = c.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>;
    expect([...tabs].some((t) => t.textContent?.includes('flightRecord.tab.bugfix'))).toBe(false);
    expect([...tabs].some((t) => t.textContent?.includes('memory.review.tab'))).toBe(false);
    expect(c.querySelector('[aria-label="bug-history"]')).toBeNull();
    expect(c.querySelector('[aria-label="review-panel"]')).toBeNull();
    expect(c.querySelector('[data-memory-tab-host="bug"]')).toBeNull();
    expect(c.querySelector('[data-memory-tab-host="review"]')).toBeNull();
    expect(c.querySelector('[data-memory-tab-host="drift"]')).toBeNull();
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

  it('destroy() でサブビューも破棄される', async () => {
    const c = document.createElement('div');
    const handle = mountMemoryPanel(c, baseProps());
    await flush(8);

    expect(c.childElementCount).toBeGreaterThan(0);
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });

  it('update() を probe 後に呼ぶとサブビューが更新される', async () => {
    // Reset hash so activeTab starts at the default tab
    globalThis.history?.replaceState(null, '', '#');
    const c = document.createElement('div');
    const handle = mountMemoryPanel(c, baseProps({ t: (_k) => 'OLD' }));
    await flush(8);

    handle.update(baseProps({ t: (k) => `NEW:${k}` }));
    // t() が反映されているのでタブバーのラベルに NEW: プレフィクスが付く
    expect(c.textContent).toContain('NEW:memory.runs.tab');
    // サブビューの内容にも t() が反映されている
    expect(c.querySelector('[role="tablist"]')).not.toBeNull();
  });
});
