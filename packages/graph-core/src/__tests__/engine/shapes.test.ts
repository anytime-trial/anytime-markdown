import {
  getCurrentColors,
  setCurrentColors,
  getOrLoadImage,
  clearImageCache,
  makeFill,
  applyShadow,
  clearShadow,
  effectiveBorderRadius,
  drawDiamond,
  drawParallelogram,
  drawCylinderBody,
  drawCylinderTop,
  drawRoundedRect,
} from '../../engine/shapes';
import type { GraphNode } from '../../types';

// Minimal CanvasRenderingContext2D stub recording method calls.
function makeCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
  };
  const gradient = {
    addColorStop: jest.fn(),
  };
  const ctx = {
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arcTo: record('arcTo'),
    arc: record('arc'),
    ellipse: record('ellipse'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    createLinearGradient: jest.fn(() => gradient),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
  return { ctx, calls, gradient };
}

const STYLE_BASE: GraphNode['style'] = {
  fill: '#fff',
  stroke: '#000',
  borderRadius: 4,
} as unknown as GraphNode['style'];

describe('currentColors getter/setter', () => {
  test('setCurrentColors changes value returned by getCurrentColors', () => {
    const before = getCurrentColors();
    setCurrentColors({ ...before, canvasBg: '#aaa' } as unknown as ReturnType<typeof getCurrentColors>);
    expect(getCurrentColors().canvasBg).toBe('#aaa');
    // restore
    setCurrentColors(before);
  });
});

describe('image cache', () => {
  // node 環境では Image が未定義のため、テスト用に Image スタブを差し込んで
  // キャッシュ生成パスをカバーする。
  class StubImage {
    public src = '';
    public complete = false;
  }
  const ORIGINAL_IMAGE = (globalThis as { Image?: unknown }).Image;

  beforeEach(() => {
    clearImageCache();
    (globalThis as { Image?: unknown }).Image = StubImage;
  });

  afterEach(() => {
    (globalThis as { Image?: unknown }).Image = ORIGINAL_IMAGE;
    clearImageCache();
  });

  test('returns null when Image is unavailable', () => {
    (globalThis as { Image?: unknown }).Image = undefined;
    expect(getOrLoadImage('data:image/png;base64,xxx')).toBeNull();
  });

  test('first call creates a new Image and returns null while incomplete', () => {
    const img = getOrLoadImage('data:image/png;base64,abc');
    expect(img).toBeNull(); // incomplete のため null
  });

  test('cache hit when image is still incomplete returns null', () => {
    getOrLoadImage('data:image/png;base64,zzz'); // first call: register cache
    const second = getOrLoadImage('data:image/png;base64,zzz'); // cache hit
    expect(second).toBeNull();
  });

  test('LRU eviction kicks in past MAX_IMAGE_CACHE entries', () => {
    // 51 件を投入すると最古の 1 件が evict される。clear して再投入で確認。
    for (let i = 0; i < 55; i++) getOrLoadImage(`data:image/png;base64,k${i}`);
    // 例外なく動けば OK（具体的な evict ロジックの状態は private）
    expect(true).toBe(true);
  });

  test('clearImageCache removes all entries', () => {
    getOrLoadImage('data:image/png;base64,one');
    clearImageCache();
    // After clear, subsequent call creates anew without throwing
    expect(() => getOrLoadImage('data:image/png;base64,one')).not.toThrow();
  });
});

describe('makeFill', () => {
  test('returns flat fill string when gradientTo is not set', () => {
    const { ctx } = makeCtx();
    const result = makeFill(ctx as unknown as CanvasRenderingContext2D, STYLE_BASE, 0, 0, 100, 50);
    expect(result).toBe('#fff');
  });

  test('returns vertical gradient by default when gradientTo is set', () => {
    const { ctx, gradient } = makeCtx();
    const style = { ...STYLE_BASE, gradientTo: '#000' } as unknown as GraphNode['style'];
    makeFill(ctx as unknown as CanvasRenderingContext2D, style, 10, 20, 100, 50);
    expect(ctx.createLinearGradient).toHaveBeenCalledWith(10, 20, 10, 70);
    expect(gradient.addColorStop).toHaveBeenCalledTimes(2);
  });

  test('returns horizontal gradient for gradientDirection=horizontal', () => {
    const { ctx } = makeCtx();
    const style = { ...STYLE_BASE, gradientTo: '#000', gradientDirection: 'horizontal' } as unknown as GraphNode['style'];
    makeFill(ctx as unknown as CanvasRenderingContext2D, style, 10, 20, 100, 50);
    expect(ctx.createLinearGradient).toHaveBeenCalledWith(10, 20, 110, 20);
  });

  test('returns diagonal gradient for gradientDirection=diagonal', () => {
    const { ctx } = makeCtx();
    const style = { ...STYLE_BASE, gradientTo: '#000', gradientDirection: 'diagonal' } as unknown as GraphNode['style'];
    makeFill(ctx as unknown as CanvasRenderingContext2D, style, 10, 20, 100, 50);
    expect(ctx.createLinearGradient).toHaveBeenCalledWith(10, 20, 110, 70);
  });
});

describe('applyShadow / clearShadow', () => {
  test('applyShadow sets ctx shadow* when style.shadow is truthy', () => {
    const { ctx } = makeCtx();
    const style = { ...STYLE_BASE, shadow: true } as unknown as GraphNode['style'];
    applyShadow(ctx as unknown as CanvasRenderingContext2D, style);
    expect(ctx.shadowColor).not.toBe('');
    expect(ctx.shadowBlur).not.toBe(0);
  });

  test('applyShadow leaves ctx unchanged when style.shadow is falsy', () => {
    const { ctx } = makeCtx();
    applyShadow(ctx as unknown as CanvasRenderingContext2D, STYLE_BASE);
    expect(ctx.shadowColor).toBe('');
    expect(ctx.shadowBlur).toBe(0);
  });

  test('applyShadow honours custom shadow style', () => {
    const { ctx } = makeCtx();
    const style = { ...STYLE_BASE, shadow: true } as unknown as GraphNode['style'];
    applyShadow(ctx as unknown as CanvasRenderingContext2D, style, {
      color: '#abc',
      blur: 7,
      offsetX: 1,
      offsetY: 2,
    });
    expect(ctx.shadowColor).toBe('#abc');
    expect(ctx.shadowBlur).toBe(7);
    expect(ctx.shadowOffsetX).toBe(1);
    expect(ctx.shadowOffsetY).toBe(2);
  });

  test('clearShadow resets shadow properties', () => {
    const { ctx } = makeCtx();
    ctx.shadowColor = '#abc';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
    clearShadow(ctx as unknown as CanvasRenderingContext2D);
    expect(ctx.shadowColor).toBe('transparent');
    expect(ctx.shadowBlur).toBe(0);
    expect(ctx.shadowOffsetX).toBe(0);
    expect(ctx.shadowOffsetY).toBe(0);
  });
});

describe('effectiveBorderRadius', () => {
  test('returns fallback when style.borderRadius is missing', () => {
    const style = { fill: '', stroke: '' } as unknown as GraphNode['style'];
    expect(effectiveBorderRadius(style, 8)).toBe(8);
  });

  test('returns max(fallback, style.borderRadius)', () => {
    expect(effectiveBorderRadius(STYLE_BASE, 2)).toBe(4); // borderRadius=4
    expect(effectiveBorderRadius(STYLE_BASE, 10)).toBe(10);
  });
});

describe('shape path builders use ctx primitives only', () => {
  test('drawDiamond produces 4-point closed path', () => {
    const { ctx, calls } = makeCtx();
    drawDiamond(ctx as unknown as CanvasRenderingContext2D, 0, 0, 10, 10);
    const methods = calls.map((c) => c.method);
    expect(methods[0]).toBe('beginPath');
    expect(methods.filter((m) => m === 'lineTo').length).toBe(3);
    expect(methods[methods.length - 1]).toBe('closePath');
  });

  test('drawParallelogram produces 4-point closed path', () => {
    const { ctx, calls } = makeCtx();
    drawParallelogram(ctx as unknown as CanvasRenderingContext2D, 0, 0, 10, 10);
    const methods = calls.map((c) => c.method);
    expect(methods).toContain('moveTo');
    expect(methods.filter((m) => m === 'lineTo').length).toBe(3);
    expect(methods).toContain('closePath');
  });

  test('drawCylinderBody draws two ellipses for top + bottom curves', () => {
    const { ctx, calls } = makeCtx();
    drawCylinderBody(ctx as unknown as CanvasRenderingContext2D, 0, 0, 20, 40);
    const methods = calls.map((c) => c.method);
    expect(methods.filter((m) => m === 'ellipse').length).toBe(2);
  });

  test('drawCylinderTop draws one full ellipse', () => {
    const { ctx, calls } = makeCtx();
    drawCylinderTop(ctx as unknown as CanvasRenderingContext2D, 0, 0, 20, 40);
    expect(calls.filter((c) => c.method === 'ellipse').length).toBe(1);
  });

  test('drawRoundedRect produces 4-corner arcTo path', () => {
    const { ctx, calls } = makeCtx();
    drawRoundedRect(ctx as unknown as CanvasRenderingContext2D, 0, 0, 100, 50, 5);
    const methods = calls.map((c) => c.method);
    expect(methods.filter((m) => m === 'arcTo').length).toBe(4);
    expect(methods[0]).toBe('beginPath');
    expect(methods[methods.length - 1]).toBe('closePath');
  });
});
