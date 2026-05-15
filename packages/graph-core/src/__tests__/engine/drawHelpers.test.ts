import { drawCircle, drawHandle } from '../../engine/drawHelpers';

function makeCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
  };
  return {
    calls,
    ctx: {
      beginPath: record('beginPath'),
      arc: record('arc'),
      fill: record('fill'),
      stroke: record('stroke'),
      fillRect: record('fillRect'),
      strokeRect: record('strokeRect'),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    },
  };
}

describe('drawCircle', () => {
  test('fills without stroke when stroke argument is omitted', () => {
    const { ctx, calls } = makeCtx();
    drawCircle(ctx as unknown as CanvasRenderingContext2D, 10, 20, 5, '#fff');
    expect(ctx.fillStyle).toBe('#fff');
    expect(calls.map((c) => c.method)).toEqual(
      expect.arrayContaining(['beginPath', 'arc', 'fill']),
    );
    expect(calls.some((c) => c.method === 'stroke')).toBe(false);
  });

  test('strokes when stroke argument is provided', () => {
    const { ctx, calls } = makeCtx();
    drawCircle(ctx as unknown as CanvasRenderingContext2D, 0, 0, 1, '#fff', '#000');
    expect(ctx.strokeStyle).toBe('#000');
    expect(calls.some((c) => c.method === 'stroke')).toBe(true);
  });

  test('applies lineWidth when provided', () => {
    const { ctx } = makeCtx();
    drawCircle(ctx as unknown as CanvasRenderingContext2D, 0, 0, 1, '#fff', '#000', 3);
    expect(ctx.lineWidth).toBe(3);
  });

  test('keeps default lineWidth when omitted', () => {
    const { ctx } = makeCtx();
    drawCircle(ctx as unknown as CanvasRenderingContext2D, 0, 0, 1, '#fff', '#000');
    expect(ctx.lineWidth).toBe(1);
  });
});

describe('drawHandle', () => {
  test('fills and strokes a square centered at (x,y)', () => {
    const { ctx, calls } = makeCtx();
    drawHandle(ctx as unknown as CanvasRenderingContext2D, 50, 50, 10, '#fff', '#000');
    expect(ctx.fillStyle).toBe('#fff');
    expect(ctx.strokeStyle).toBe('#000');
    const fillCall = calls.find((c) => c.method === 'fillRect');
    expect(fillCall?.args).toEqual([45, 45, 10, 10]); // centered: x-half, y-half, size, size
    const strokeCall = calls.find((c) => c.method === 'strokeRect');
    expect(strokeCall?.args).toEqual([45, 45, 10, 10]);
  });

  test('applies lineWidth when provided', () => {
    const { ctx } = makeCtx();
    drawHandle(ctx as unknown as CanvasRenderingContext2D, 0, 0, 8, '#fff', '#000', 2);
    expect(ctx.lineWidth).toBe(2);
  });
});
