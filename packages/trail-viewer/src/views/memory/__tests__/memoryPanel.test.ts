/**
 * views/memory/memoryPanel — vanilla DOM ユニットテスト（jsdom）
 *
 * - probe の 3 状態（loading / noDb / 本体）を出し分ける
 * - サブタブバーを持たない（2026-08-05 に畳んだ。Runs 単独のため）
 * - update() / destroy() が正しく動作する
 * - MemoryReader.probe() は no-throw（jsdom: no real server）
 */
import { mountMemoryPanel, type MemoryPanelViewProps } from '../memoryPanel';
import type { TrailThemeTokens } from '../../../theme/designTokens';

/**
 * 破棄の実効性を測るためのラッパ。`root.remove()` は親から切り離すだけで子孫の破棄を
 * 保証しないため、childElementCount だけを見ると「子ハンドルの destroy 呼び忘れ」を
 * 素通りさせる。実体は本物のまま、destroy の呼び出しだけを記録する。
 */
const mockRunsDestroy = jest.fn();
jest.mock('../pipelineRunsPanel', () => {
  const actual = jest.requireActual('../pipelineRunsPanel');
  return {
    ...actual,
    mountPipelineRunsPanel: (host: HTMLElement, panelProps: unknown) => {
      const handle = actual.mountPipelineRunsPanel(host, panelProps);
      return {
        ...handle,
        destroy: () => {
          mockRunsDestroy();
          handle.destroy();
        },
      };
    },
  };
});

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
// 本体（probe が true のとき）。サブタブバーは持たない。
// ---------------------------------------------------------------------------

describe('mountMemoryPanel – probe が true のとき', () => {
  beforeEach(() => {
    const { MemoryReader } = require('../../../data/readers/MemoryReader') as {
      MemoryReader: { prototype: { probe: () => Promise<boolean> } };
    };
    MemoryReader.prototype.probe = async () => true;
  });

  afterEach(() => {
    const { MemoryReader } = require('../../../data/readers/MemoryReader') as {
      MemoryReader: { prototype: Record<string, unknown> };
    };
    delete MemoryReader.prototype.probe;
    document.body.querySelectorAll('[data-am-dialog-backdrop]').forEach((el) => el.remove());
  });

  it('サブタブバーを描画しない（選択肢が 1 つしかないため畳んだ）', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    expect(c.querySelector('[role="tablist"]')).toBeNull();
    expect(c.querySelector('[role="tab"]')).toBeNull();
  });

  it('Runs パネルを直接マウントする', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    expect(c.querySelector('[aria-label="pipeline-runs"]')).not.toBeNull();
  });

  it('移設済みサブビューはどれも現れない', async () => {
    const c = document.createElement('div');
    mountMemoryPanel(c, baseProps());
    await flush(8);
    expect(c.querySelector('[aria-label="bug-history"]')).toBeNull();
    expect(c.querySelector('[aria-label="review-panel"]')).toBeNull();
    expect(c.querySelector('[aria-label="chat-panel"]')).toBeNull();
    expect(c.textContent).not.toContain('flightRecord.drift.');
  });

  it('update() の t() が本体にも反映される', async () => {
    const c = document.createElement('div');
    const handle = mountMemoryPanel(c, baseProps({ t: (_k) => 'OLD' }));
    await flush(8);

    handle.update(baseProps({ t: (k) => `NEW:${k}` }));
    await flush(4);
    expect(c.textContent).toContain('NEW:');
  });

  it('destroy() で本体パネルの destroy まで呼ぶ（DOM 除去だけで済ませない）', async () => {
    mockRunsDestroy.mockClear();
    const c = document.createElement('div');
    const handle = mountMemoryPanel(c, baseProps());
    await flush(8);

    expect(c.childElementCount).toBeGreaterThan(0);
    handle.destroy();
    expect(c.childElementCount).toBe(0);
    // root.remove() は子孫の後始末をしないので、子ハンドルの destroy 到達を直接見る
    expect(mockRunsDestroy).toHaveBeenCalledTimes(1);
  });
});
