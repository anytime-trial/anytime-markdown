/**
 * trailViewerApp の emergencyEnabled 配線。
 *
 * FAB は **明示 opt-in のときだけ**出す。この viewer は web-app（公開デプロイ）にも
 * 埋め込まれるため、既定で出ると公開サイトへローカル機の緊急停止 UI が現れる。
 */
// trailViewerApp → trailViewer → c4Viewer → codeGraphPanel が sigma を静的に引き込む
// （jsdom に WebGL2RenderingContext が無い）。trailViewer.test.ts と同じ方針で無害化する。
jest.mock('sigma', () => ({
  __esModule: true,
  default: class MockSigma {
    on() { /* no-op */ }
    getGraph() { return { forEachNode: () => { /* no-op */ }, setNodeAttribute: () => { /* no-op */ } }; }
    refresh() { /* no-op */ }
    kill() { /* no-op */ }
  },
}));
jest.mock('sigma/rendering', () => ({ EdgeArrowProgram: class MockEdgeArrowProgram {} }));
jest.mock('../reactIsland', () => ({
  mountReactIsland: jest.fn(() => ({ update: jest.fn(), destroy: jest.fn() })),
}));
jest.mock('../PromptManagerIsland', () => ({ PromptManagerIsland: 'PromptManagerIsland' }));
jest.mock('@anytime-markdown/trace-viewer', () => ({ TraceViewer: 'TraceViewer' }));
// marked は ESM 配布で ts-jest の transform 対象外。プレビューは本テストの対象外なので差し替える。
jest.mock('../../components/shared/LazyPromptMarkdownPreview', () => ({
  LazyPromptMarkdownPreview: 'LazyPromptMarkdownPreview',
}));

import { mountTrailViewerApp } from '../trailViewerApp';

/** 未配線 API・WS を叩かせないため fetch / WebSocket を無害化する。 */
function stubNetwork(): { emergencyCalls: number } {
  const counter = { emergencyCalls: 0 };
  globalThis.fetch = ((url: string) => {
    if (String(url).includes('/api/trail/emergency-state')) counter.emergencyCalls++;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ active: false }),
    } as unknown as Response);
  }) as typeof fetch;
  class FakeWs {
    close(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
    send(): void {}
  }
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWs;
  return counter;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

describe('trailViewerApp — emergency 配線', () => {
  const originalFetch = globalThis.fetch;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    container.remove();
  });

  it('既定（web-app 埋め込み相当）では FAB を出さず emergency API も叩かない', async () => {
    const counter = stubNetwork();
    const handle = mountTrailViewerApp(container, { serverUrl: '', disableWebSocket: true });
    await settle();

    expect(container.querySelector('[data-am-emergency-fab]')).toBeNull();
    expect(counter.emergencyCalls).toBe(0);
    handle.destroy();
  });

  it('emergencyEnabled=true（standalone 相当）では FAB を出す', async () => {
    stubNetwork();
    const handle = mountTrailViewerApp(container, {
      serverUrl: '',
      disableWebSocket: true,
      emergencyEnabled: true,
    });
    await settle();

    expect(container.querySelector('[data-am-emergency-fab]')).not.toBeNull();
    handle.destroy();
  });

  it('destroy で FAB を残さない', async () => {
    stubNetwork();
    const handle = mountTrailViewerApp(container, {
      serverUrl: '',
      disableWebSocket: true,
      emergencyEnabled: true,
    });
    await settle();
    handle.destroy();

    expect(container.querySelector('[data-am-emergency-fab]')).toBeNull();
  });
});
