import { createNode } from '../../types';
import type { GraphEdge, GraphNode, NodeType } from '../../types';
import { getCanvasColors } from '../../theme';
import {
  drawBoundingBox,
  drawConnectionPoints,
  drawEdgeEndpointHandles,
  drawResizeHandles,
  drawSelectionRect,
  drawShapePreview,
  drawSmartGuides,
  drawSnapHighlight,
} from '../../engine/overlays';

/** 呼び出しを記録する CanvasRenderingContext2D スタブ。 */
function makeCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const ctx = {
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    arcTo: record('arcTo'),
    ellipse: record('ellipse'),
    bezierCurveTo: record('bezierCurveTo'),
    quadraticCurveTo: record('quadraticCurveTo'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    setLineDash: record('setLineDash'),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  const methodsOf = (name: string) => calls.filter((c) => c.method === name);
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, methodsOf };
}

const COLORS = getCanvasColors(true);

function node(overrides: Partial<GraphNode> = {}): GraphNode {
  return createNode('rect', 100, 200, { width: 80, height: 40, ...overrides });
}

function edge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: 'e1',
    type: 'line',
    from: { x: 0, y: 0 },
    to: { x: 100, y: 100 },
    style: { stroke: '#000', strokeWidth: 1 },
    ...overrides,
  } as unknown as GraphEdge;
}

describe('drawResizeHandles', () => {
  it('8 点のハンドルを描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawResizeHandles(ctx, node(), 1, COLORS);
    // drawHandle は塗りと線を 1 回ずつ出す
    expect(methodsOf('fillRect').length + methodsOf('arc').length).toBeGreaterThanOrEqual(8);
    expect(methodsOf('save')).toHaveLength(1);
    expect(methodsOf('restore')).toHaveLength(1);
  });

  it('scale が大きいほどハンドルは論理座標で小さくなる', () => {
    const a = makeCtx();
    drawResizeHandles(a.ctx, node(), 1, COLORS);
    const b = makeCtx();
    drawResizeHandles(b.ctx, node(), 4, COLORS);
    expect(b.ctx.lineWidth).toBeLessThan(a.ctx.lineWidth);
  });

  it('colors 省略時も既定色で描ける', () => {
    const { ctx, methodsOf } = makeCtx();
    expect(() => drawResizeHandles(ctx, node(), 1)).not.toThrow();
    expect(methodsOf('save')).toHaveLength(1);
  });
});

describe('drawBoundingBox', () => {
  it('複数ノードを包む破線枠を描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawBoundingBox(
      ctx,
      [node({ x: 0, y: 0, width: 10, height: 10 }), node({ x: 100, y: 50, width: 20, height: 20 })],
      1,
      COLORS,
    );
    const rects = methodsOf('strokeRect');
    expect(rects.length).toBeGreaterThanOrEqual(1);
    const [bx, by, bw, bh] = rects[0].args as number[];
    // padding の分だけ外側へ広がる
    expect(bx).toBeLessThan(0);
    expect(by).toBeLessThan(0);
    expect(bw).toBeGreaterThan(120);
    expect(bh).toBeGreaterThan(70);
  });

  it('破線を設定したあと必ず解除する', () => {
    const { ctx, methodsOf } = makeCtx();
    drawBoundingBox(ctx, [node()], 1, COLORS);
    const dashes = methodsOf('setLineDash').map((c) => c.args[0] as number[]);
    expect(dashes[0].length).toBeGreaterThan(0);
    expect(dashes.at(-1)).toEqual([]);
  });

  it('colors 省略時も描ける', () => {
    const { ctx } = makeCtx();
    expect(() => drawBoundingBox(ctx, [node()], 1)).not.toThrow();
  });
});

describe('drawEdgeEndpointHandles', () => {
  it('waypoints が無ければ from / to の 2 点に描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawEdgeEndpointHandles(ctx, edge(), 1, COLORS);
    // 1 点につき外円・内円の 2 つ
    expect(methodsOf('arc')).toHaveLength(4);
  });

  it('waypoints があれば先頭と末尾を使う', () => {
    const { ctx, methodsOf } = makeCtx();
    drawEdgeEndpointHandles(
      ctx,
      edge({ waypoints: [{ x: 5, y: 5 }, { x: 50, y: 50 }, { x: 90, y: 10 }] }),
      1,
      COLORS,
    );
    const centers = methodsOf('arc').map((c) => [c.args[0], c.args[1]]);
    expect(centers[0]).toEqual([5, 5]);
    expect(centers.at(-1)).toEqual([90, 10]);
  });

  it('waypoints が 1 点だけなら from / to へ退避する', () => {
    const { ctx, methodsOf } = makeCtx();
    drawEdgeEndpointHandles(ctx, edge({ waypoints: [{ x: 5, y: 5 }] }), 1, COLORS);
    const centers = methodsOf('arc').map((c) => [c.args[0], c.args[1]]);
    expect(centers[0]).toEqual([0, 0]);
  });

  it('colors 省略時も描ける', () => {
    const { ctx } = makeCtx();
    expect(() => drawEdgeEndpointHandles(ctx, edge(), 1)).not.toThrow();
  });
});

describe('drawConnectionPoints', () => {
  it('マウス座標が無ければ全ての接続点を描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawConnectionPoints(ctx, node(), 1, undefined, undefined, COLORS);
    expect(methodsOf('arc').length).toBeGreaterThan(2);
  });

  it('マウス座標があれば最も近い 1 点だけ描く', () => {
    const { ctx, methodsOf } = makeCtx();
    const n = node({ x: 0, y: 0, width: 100, height: 100 });
    drawConnectionPoints(ctx, n, 1, 50, -1000, COLORS);
    // 外円 + 内円 の 2 本だけ
    expect(methodsOf('arc')).toHaveLength(2);
    const [cx, cy] = methodsOf('arc')[0].args as number[];
    expect(cx).toBe(50);
    expect(cy).toBe(0);
  });

  it('colors 省略時も描ける', () => {
    const { ctx } = makeCtx();
    expect(() => drawConnectionPoints(ctx, node(), 1)).not.toThrow();
  });
});

describe('drawSnapHighlight', () => {
  it('ellipse は楕円で、それ以外は矩形でハイライトする', () => {
    const ell = makeCtx();
    drawSnapHighlight(ell.ctx, node({ type: 'ellipse' }), COLORS);
    expect(ell.methodsOf('ellipse')).toHaveLength(1);

    const rect = makeCtx();
    drawSnapHighlight(rect.ctx, node({ type: 'rect' }), COLORS);
    expect(rect.methodsOf('ellipse')).toHaveLength(0);
    expect(rect.methodsOf('strokeRect').length).toBeGreaterThanOrEqual(1);
  });

  it('4 辺中央に接続点インジケータ（外円・内円）を描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawSnapHighlight(ctx, node({ type: 'rect' }), COLORS);
    expect(methodsOf('arc')).toHaveLength(8);
  });

  it('colors 省略時も描ける', () => {
    const { ctx } = makeCtx();
    expect(() => drawSnapHighlight(ctx, node())).not.toThrow();
  });
});

describe('drawShapePreview', () => {
  it('2px 未満のドラッグでは何も描かない', () => {
    const { ctx, calls } = makeCtx();
    drawShapePreview(ctx, 10, 10, 11, 11, 'rect', COLORS);
    expect(calls).toHaveLength(0);
  });

  it('座標が逆順でも左上原点へ正規化する', () => {
    const { ctx, methodsOf } = makeCtx();
    drawShapePreview(ctx, 100, 80, 20, 10, 'rect', COLORS);
    const [x, y, w, h] = methodsOf('fillRect')[0].args as number[];
    expect([x, y, w, h]).toEqual([20, 10, 80, 70]);
  });

  it.each<[Exclude<NodeType, 'image'>, string]>([
    ['ellipse', 'ellipse'],
    ['diamond', 'lineTo'],
    ['parallelogram', 'lineTo'],
    ['cylinder', 'ellipse'],
  ])('%s は専用のパスで描く', (shapeType, method) => {
    const { ctx, methodsOf } = makeCtx();
    drawShapePreview(ctx, 0, 0, 100, 60, shapeType, COLORS);
    expect(methodsOf(method).length).toBeGreaterThan(0);
    expect(methodsOf('fillRect')).toHaveLength(0);
  });

  it('cylinder は本体に加えて天面の楕円も描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawShapePreview(ctx, 0, 0, 100, 60, 'cylinder', COLORS);
    // 本体で 2 回 + 天面で 1 回
    expect(methodsOf('ellipse')).toHaveLength(3);
    expect(methodsOf('stroke')).toHaveLength(2);
  });

  it('既定シェイプは矩形で描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawShapePreview(ctx, 0, 0, 100, 60, 'sticky', COLORS);
    expect(methodsOf('fillRect')).toHaveLength(1);
    expect(methodsOf('strokeRect')).toHaveLength(1);
  });

  it('描画後に破線を解除する', () => {
    const { ctx, methodsOf } = makeCtx();
    drawShapePreview(ctx, 0, 0, 100, 60, 'rect', COLORS);
    expect(methodsOf('setLineDash').at(-1)?.args[0]).toEqual([]);
  });

  it('colors 省略時も描ける', () => {
    const { ctx } = makeCtx();
    expect(() => drawShapePreview(ctx, 0, 0, 100, 60, 'rect')).not.toThrow();
  });
});

describe('drawSmartGuides', () => {
  it('x 軸ガイドは垂直線、y 軸ガイドは水平線として描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawSmartGuides(
      ctx,
      [
        { axis: 'x', position: 50, from: 10, to: 90 },
        { axis: 'y', position: 70, from: 20, to: 80 },
      ] as never,
      COLORS,
    );
    const moves = methodsOf('moveTo').map((c) => c.args as number[]);
    const lines = methodsOf('lineTo').map((c) => c.args as number[]);
    // x 軸: X 座標が動かない
    expect(moves[0][0]).toBe(lines[0][0]);
    // y 軸: Y 座標が動かない
    expect(moves[1][1]).toBe(lines[1][1]);
  });

  it('ガイドが空でも save/restore と破線解除は行う', () => {
    const { ctx, methodsOf } = makeCtx();
    drawSmartGuides(ctx, [], COLORS);
    expect(methodsOf('stroke')).toHaveLength(0);
    expect(methodsOf('setLineDash').at(-1)?.args[0]).toEqual([]);
    expect(methodsOf('restore')).toHaveLength(1);
  });

  it('colors 省略時も描ける', () => {
    const { ctx } = makeCtx();
    expect(() => drawSmartGuides(ctx, [])).not.toThrow();
  });
});

describe('drawSelectionRect', () => {
  it('塗りと破線枠を同じ矩形で描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawSelectionRect(ctx, 5, 6, 70, 40, COLORS);
    expect(methodsOf('fillRect')[0].args).toEqual([5, 6, 70, 40]);
    expect(methodsOf('strokeRect')[0].args).toEqual([5, 6, 70, 40]);
    expect(methodsOf('setLineDash').at(-1)?.args[0]).toEqual([]);
  });

  it('colors 省略時も描ける', () => {
    const { ctx } = makeCtx();
    expect(() => drawSelectionRect(ctx, 0, 0, 10, 10)).not.toThrow();
  });
});
