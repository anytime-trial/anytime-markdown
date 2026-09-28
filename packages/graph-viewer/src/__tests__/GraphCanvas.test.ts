/** @jest-environment jsdom */
import { createGraphCanvas, type GraphCanvasHandle } from '../components-vanilla/GraphCanvas';

describe('GraphCanvas accessibility', () => {
  let handle: GraphCanvasHandle | undefined;

  beforeEach(() => {
    jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => ({
      matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn(),
    })) });
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class {
      observe() {}
      disconnect() {}
    } });
  });

  afterEach(() => {
    handle?.destroy();
    handle = undefined;
    jest.restoreAllMocks();
    Reflect.deleteProperty(window, 'matchMedia');
    Reflect.deleteProperty(globalThis, 'ResizeObserver');
  });

  function build(ariaLabel?: string) {
    handle = createGraphCanvas({
      nodes: [], edges: [], viewport: { offsetX: 0, offsetY: 0, scale: 1 },
      selection: { nodeIds: [], edgeIds: [] }, showGrid: false,
      previewRef: { current: { type: 'none', fromX: 0, fromY: 0, toX: 0, toY: 0 } },
      hoverNodeIdRef: { current: undefined }, mouseWorldRef: { current: { x: 0, y: 0 } },
      ariaLabel,
    });
    return handle;
  }

  it.each([['en-US', 'Graph canvas'], ['ja-JP', 'グラフキャンバス']])(
    'main canvas has image role and localized label (%s)', (locale, label) => {
      jest.spyOn(navigator, 'language', 'get').mockReturnValue(locale);
      const { canvas, el } = build();
      expect(el.querySelectorAll('canvas')).toHaveLength(1);
      expect(canvas.getAttribute('role')).toBe('img');
      expect(canvas.getAttribute('aria-label')).toBe(label);
      expect(canvas.getAttribute('aria-hidden')).not.toBe('true');
    },
  );

  it('preserves an explicit accessible label', () => {
    expect(build('Dependency graph').canvas.getAttribute('aria-label')).toBe('Dependency graph');
  });

  it('uses a localized fallback for an empty accessible label', () => {
    jest.spyOn(navigator, 'language', 'get').mockReturnValue('en');
    expect(build('').canvas.getAttribute('aria-label')).toBe('Graph canvas');
  });
});
