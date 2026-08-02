/**
 * trailViewerApp の TRC-5 ソースジャンプ配線。
 *
 * trace-viewer 側は `onJumpToSource` を呼ぶだけで、実際にエディタを開くのはホスト。
 * ここが未配線だと「クリックしても何も起きない」形で静かに壊れる（型エラーにならない）。
 */
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
jest.mock('../../components/shared/LazyPromptMarkdownPreview', () => ({
  LazyPromptMarkdownPreview: 'LazyPromptMarkdownPreview',
}));

let capturedProps: Record<string, unknown> | null = null;
jest.mock('../trailViewer', () => ({
  mountTrailViewer: jest.fn((_el: HTMLElement, props: Record<string, unknown>) => {
    capturedProps = props;
    return {
      update: (next: Record<string, unknown>) => { capturedProps = next; },
      destroy: jest.fn(),
    };
  }),
}));

import { mountTrailViewerApp } from '../trailViewerApp';

const sentFrames: string[] = [];

class FakeWs {
  static readonly OPEN = 1;
  readonly readyState = 1;
  close(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  send(data: string): void { sentFrames.push(data); }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

describe('trailViewerApp — ソースジャンプ配線', () => {
  const originalFetch = globalThis.fetch;
  let container: HTMLElement;

  beforeEach(() => {
    sentFrames.length = 0;
    capturedProps = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    globalThis.fetch = (() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response)) as typeof fetch;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWs;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    container.remove();
  });

  it('onJumpToSource が open-file コマンドを行番号付きで送る', async () => {
    const handle = mountTrailViewerApp(container, { serverUrl: '' });
    await settle();

    // C4 タブ訪問で c4 ストアを有効化し WebSocket を張る（sendCommand の前提）。
    (capturedProps?.onTabVisit as (tab: number) => void)(4);
    await settle();

    const onJumpToSource = capturedProps?.onJumpToSource as ((loc: { file: string; line: number }) => void) | undefined;
    expect(typeof onJumpToSource).toBe('function');
    onJumpToSource?.({ file: '/repo/src/foo.ts', line: 42 });

    expect(sentFrames.map((f) => JSON.parse(f))).toContainEqual({
      type: 'open-file',
      filePath: '/repo/src/foo.ts',
      line: 42,
    });

    handle.destroy();
  });
});
