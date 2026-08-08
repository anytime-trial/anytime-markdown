/**
 * @jest-environment jsdom
 */
import { computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';
import type { ViewportBounds } from '../types';

function serverLaidOutFile(): CooccurrenceFile {
  const base: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-08-08T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
    },
  };
  base.layout = {
    positions: [[0, 0], [50, 0]],
    specHash: computeSpecHash(base.spec),
    source: 'server',
  };
  return base;
}

function flush(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

describe('mountCooccurrenceViewer viewport change notice', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    Object.defineProperty(window, 'requestAnimationFrame', { value: jest.fn(() => 1), configurable: true });
    Object.defineProperty(window, 'cancelAnimationFrame', { value: jest.fn(), configurable: true });
    Object.defineProperty(window, 'ResizeObserver', {
      value: class {
        observe(): void {}
        disconnect(): void {}
      },
      configurable: true,
    });
    // jsdom は clientWidth / clientHeight を常に 0 で返す。視野は canvas の表示サイズで
    // 決まるため、0 のままだと幅 0 の矩形しか出ず、退行と正常を区別できない。
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { value: 600, configurable: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    document.body.replaceChildren();
  });

  function mount(onViewportChange: (b: ViewportBounds) => void, delayMs?: number) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    return mountCooccurrenceViewer(container, {
      file: serverLaidOutFile(),
      themeMode: 'light',
      onViewportChange,
      ...(delayMs === undefined ? {} : { viewportChangeDelayMs: delayMs }),
    });
  }

  function pressZoomIn(): void {
    const canvas = document.querySelector('canvas');
    canvas?.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
  }

  it('reports the visible world rectangle once the view settles', async () => {
    const seen: ViewportBounds[] = [];
    const handle = mount((b) => seen.push(b));
    await flush();
    seen.length = 0;

    pressZoomIn();
    expect(seen).toHaveLength(0); // 操作直後は呼ばない

    jest.advanceTimersByTime(300);

    expect(seen).toHaveLength(1);
    const bounds = seen[0]!;
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
    expect(bounds.maxY).toBeGreaterThan(bounds.minY);
    handle.destroy();
  });

  it('collapses a burst of viewport changes into a single notice', async () => {
    const seen: ViewportBounds[] = [];
    const handle = mount((b) => seen.push(b));
    await flush();
    seen.length = 0;

    for (let i = 0; i < 5; i += 1) {
      pressZoomIn();
      jest.advanceTimersByTime(100); // 静止時間 300ms に届かないまま次の操作
    }
    expect(seen).toHaveLength(0);

    jest.advanceTimersByTime(300);
    expect(seen).toHaveLength(1);
    handle.destroy();
  });

  it('narrows the reported rectangle as the view zooms in', async () => {
    const seen: ViewportBounds[] = [];
    const handle = mount((b) => seen.push(b));
    await flush();
    seen.length = 0;

    pressZoomIn();
    jest.advanceTimersByTime(300);
    pressZoomIn();
    jest.advanceTimersByTime(300);

    expect(seen).toHaveLength(2);
    const [first, second] = seen as [ViewportBounds, ViewportBounds];
    expect(second.maxX - second.minX).toBeLessThan(first.maxX - first.minX);
    handle.destroy();
  });

  it('honours a custom settle delay', async () => {
    const seen: ViewportBounds[] = [];
    const handle = mount((b) => seen.push(b), 1000);
    await flush();
    seen.length = 0;

    pressZoomIn();
    jest.advanceTimersByTime(300);
    expect(seen).toHaveLength(0);

    jest.advanceTimersByTime(700);
    expect(seen).toHaveLength(1);
    handle.destroy();
  });

  it('does not fire after destroy', async () => {
    const seen: ViewportBounds[] = [];
    const handle = mount((b) => seen.push(b));
    await flush();
    seen.length = 0;

    pressZoomIn();
    handle.destroy();
    jest.advanceTimersByTime(1000);

    expect(seen).toEqual([]);
  });
});
