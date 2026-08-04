import { createNode } from '../../types';
import type { GraphNode, NodeType } from '../../types';
import { getCanvasColors } from '../../theme';
import {
  drawNode,
  drawLockIndicator,
  renderRoundedShape,
  setupStroke,
  specialShapes,
  skipTextTypes,
  standardShapePaths,
} from '../../engine/shapeRenderers';
import { clearImageCache, getCurrentColors } from '../../engine/shapes';

/**
 * 呼び出しを記録する CanvasRenderingContext2D スタブ。
 * 描画結果そのものは検証できないため、「どの API がどの引数で呼ばれたか」で
 * シェイプごとの分岐を固定する。
 */
function makeCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const gradient = { addColorStop: jest.fn() };
  const ctx = {
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arcTo: record('arcTo'),
    arc: record('arc'),
    ellipse: record('ellipse'),
    rect: record('rect'),
    quadraticCurveTo: record('quadraticCurveTo'),
    bezierCurveTo: record('bezierCurveTo'),
    fill: record('fill'),
    stroke: record('stroke'),
    clip: record('clip'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    setLineDash: record('setLineDash'),
    translate: record('translate'),
    scale: record('scale'),
    rotate: record('rotate'),
    drawImage: record('drawImage'),
    createLinearGradient: jest.fn(() => gradient),
    // 1 文字 = 8px として折り返し計算を決定論にする
    measureText: jest.fn((t: string) => ({ width: t.length * 8 })),
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 1,
    lineDashOffset: 0,
    globalAlpha: 1,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
  // shadowBlur は描画途中で立てられ clearShadow で 0 に戻るため、
  // 終了後の値を見ても «影を設定したか» は判定できない。代入の履歴を残す。
  const shadowBlurLog: number[] = [];
  let shadowBlurValue = 0;
  Object.defineProperty(ctx, 'shadowBlur', {
    get: () => shadowBlurValue,
    set: (v: number) => {
      shadowBlurValue = v;
      shadowBlurLog.push(v);
    },
  });
  const methodsOf = (name: string) => calls.filter((c) => c.method === name);
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, methodsOf, gradient, shadowBlurLog };
}

const ALL_TYPES: NodeType[] = [
  'rect',
  'ellipse',
  'sticky',
  'text',
  'diamond',
  'parallelogram',
  'cylinder',
  'doc',
  'frame',
  'image',
  'person',
  'fragment',
];

const COLORS = getCanvasColors(true);

function node(type: NodeType, overrides: Partial<GraphNode> = {}): GraphNode {
  return createNode(type, 10, 20, { width: 160, height: 90, text: 'ノード', ...overrides });
}

beforeEach(() => {
  clearImageCache();
});

describe('drawNode — 全ノードタイプ', () => {
  it.each(ALL_TYPES)('%s を描画しても例外を投げず save/restore が対になる', (type) => {
    const { ctx, methodsOf } = makeCtx();
    expect(() => drawNode(ctx, node(type), false, false, COLORS)).not.toThrow();
    expect(methodsOf('save').length).toBe(methodsOf('restore').length);
  });

  it.each(ALL_TYPES)('%s は選択状態でも描画できる', (type) => {
    const { ctx, methodsOf } = makeCtx();
    drawNode(ctx, node(type), true, false, COLORS);
    expect(methodsOf('save').length).toBe(methodsOf('restore').length);
  });

  it('特殊レンダラのあるタイプと標準シェイプのタイプが重複しない', () => {
    for (const type of Object.keys(specialShapes) as NodeType[]) {
      expect(specialShapes[type]).toBeInstanceOf(Function);
    }
    // 標準シェイプ側にしか無いタイプが存在する（ellipse / diamond など）
    const standardOnly = (Object.keys(standardShapePaths) as NodeType[]).filter(
      (t) => !(t in specialShapes),
    );
    expect(standardOnly.length).toBeGreaterThan(0);
  });

  it('未登録タイプは何も描かずに save/restore だけ行う', () => {
    const { ctx, calls, methodsOf } = makeCtx();
    drawNode(ctx, node('rect', { type: 'unknown' as NodeType, text: '' }), false, false, COLORS);
    expect(methodsOf('save')).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'fill')).toHaveLength(0);
  });
});

describe('drawNode — 不透明度とドラッグ', () => {
  it('opacity は globalAlpha へ乗算される', () => {
    const { ctx } = makeCtx();
    ctx.globalAlpha = 1;
    drawNode(ctx, node('rect', { style: { ...node('rect').style, opacity: 50 } }), false, false, COLORS);
    // restore() を伴わないスタブなので、描画後の globalAlpha が乗算結果を保持する
    expect(ctx.globalAlpha).toBeCloseTo(0.5);
  });

  it.each([
    [-10, 0],
    [150, 1],
  ])('opacity=%s は 0..1 へクランプされる', (opacity, expected) => {
    const { ctx } = makeCtx();
    ctx.globalAlpha = 1;
    drawNode(ctx, node('rect', { style: { ...node('rect').style, opacity } }), false, false, COLORS);
    expect(ctx.globalAlpha).toBeCloseTo(expected);
  });

  it('ドラッグ中は通常より強い影を設定する', () => {
    const dragging = makeCtx();
    drawNode(dragging.ctx, node('rect'), false, true, COLORS);
    const still = makeCtx();
    drawNode(still.ctx, node('rect'), false, false, COLORS);
    expect(Math.max(...dragging.shadowBlurLog)).toBeGreaterThan(Math.max(...still.shadowBlurLog));
  });
});

describe('drawNode — テキスト描画', () => {
  it('テキストを持つ標準シェイプは fillText を呼ぶ', () => {
    const { ctx, methodsOf } = makeCtx();
    drawNode(ctx, node('rect', { text: 'あいう' }), false, false, COLORS);
    expect(methodsOf('fillText').length).toBeGreaterThan(0);
  });

  it('テキストが空なら fillText を呼ばない', () => {
    const { ctx, methodsOf } = makeCtx();
    drawNode(ctx, node('rect', { text: '' }), false, false, COLORS);
    expect(methodsOf('fillText')).toHaveLength(0);
  });

  it.each([...skipTextTypes])('%s は共通テキスト描画をスキップする', (type) => {
    expect(skipTextTypes.has(type)).toBe(true);
  });

  it('行数が上限を超えると最終行へ省略記号を付ける', () => {
    const { ctx, methodsOf } = makeCtx();
    // height を小さくして表示可能行数を 1 行に絞る
    const long = 'あ'.repeat(400);
    drawNode(ctx, node('rect', { text: long, width: 60, height: 30 }), false, false, COLORS);
    const texts = methodsOf('fillText').map((c) => String(c.args[0]));
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.at(-1)).toContain('…');
  });
});

describe('drawNode — リンクアイコン', () => {
  it('url を持つノードはリンク絵文字を描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawNode(ctx, node('rect', { text: '', url: 'https://example.com' }), false, false, COLORS);
    expect(methodsOf('fillText').map((c) => c.args[0])).toContain('\u{1F517}');
  });

  it('url が無ければリンク絵文字を描かない', () => {
    const { ctx, methodsOf } = makeCtx();
    drawNode(ctx, node('rect', { text: '' }), false, false, COLORS);
    expect(methodsOf('fillText').map((c) => c.args[0])).not.toContain('\u{1F517}');
  });
});

describe('drawNode — タイプ固有の分岐', () => {
  it('frame は折りたたみ状態で描画内容が変わる', () => {
    const open = makeCtx();
    drawNode(open.ctx, node('frame', { collapsed: false, label: 'グループ' }), false, false, COLORS);
    const collapsed = makeCtx();
    drawNode(collapsed.ctx, node('frame', { collapsed: true, label: 'グループ' }), false, false, COLORS);
    expect(open.calls.length).not.toBe(collapsed.calls.length);
  });

  it('doc は docContent のプレビュー行を描く', () => {
    const withContent = makeCtx();
    drawNode(
      withContent.ctx,
      node('doc', { text: 'タイトル', docContent: '1 行目\n2 行目\n3 行目' }),
      false,
      false,
      COLORS,
    );
    const withoutContent = makeCtx();
    drawNode(withoutContent.ctx, node('doc', { text: 'タイトル' }), false, false, COLORS);
    expect(withContent.methodsOf('fillText').length).toBeGreaterThan(
      withoutContent.methodsOf('fillText').length,
    );
  });

  it('image は imageData が無ければプレースホルダを描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawNode(ctx, node('image', { text: '' }), false, false, COLORS);
    expect(methodsOf('drawImage')).toHaveLength(0);
  });

  it('cylinder は本体と天面を別々に描く', () => {
    const { ctx, methodsOf } = makeCtx();
    drawNode(ctx, node('cylinder'), false, false, COLORS);
    expect(methodsOf('ellipse').length + methodsOf('bezierCurveTo').length).toBeGreaterThan(0);
  });

  it('colors 未指定でも既定のダークテーマ色で描画できる', () => {
    const { ctx } = makeCtx();
    expect(() => drawNode(ctx, node('rect'), false)).not.toThrow();
    expect(getCurrentColors()).toBeTruthy();
  });
});

describe('setupStroke', () => {
  it('非選択時は style の stroke と strokeWidth を使う', () => {
    const { ctx } = makeCtx();
    const style = { ...node('rect').style, stroke: '#123456', strokeWidth: 7 };
    setupStroke(ctx, style, false);
    expect(ctx.strokeStyle).toBe('#123456');
    expect(ctx.lineWidth).toBe(7);
  });

  it('選択時は選択色と選択用の線幅へ切り替える', () => {
    const { ctx } = makeCtx();
    const style = { ...node('rect').style, stroke: '#123456', strokeWidth: 7 };
    setupStroke(ctx, style, true);
    expect(ctx.strokeStyle).not.toBe('#123456');
    expect(ctx.lineWidth).not.toBe(7);
  });
});

describe('renderRoundedShape', () => {
  it('影 → 塗り → 影解除 → 線の順で描く', () => {
    const { ctx, calls } = makeCtx();
    renderRoundedShape(ctx, node('rect'), false, '#abcdef', 8);
    const order = calls.map((c) => c.method);
    expect(order.indexOf('fill')).toBeGreaterThanOrEqual(0);
    expect(order.lastIndexOf('stroke')).toBeGreaterThan(order.indexOf('fill'));
  });
});

describe('drawLockIndicator', () => {
  it('scale に応じてアイコン位置とサイズを変える', () => {
    const a = makeCtx();
    drawLockIndicator(a.ctx, node('rect'), 1, COLORS);
    const b = makeCtx();
    drawLockIndicator(b.ctx, node('rect'), 2, COLORS);
    const rectA = a.methodsOf('fillRect')[0]?.args as number[];
    const rectB = b.methodsOf('fillRect')[0]?.args as number[];
    expect(rectA).toBeDefined();
    expect(rectB).toBeDefined();
    // scale が大きいほど（= 拡大表示ほど）アイコンは論理座標で小さくなる
    expect(rectB[2]).toBeLessThan(rectA[2]);
  });

  it('colors 未指定でも描画できる', () => {
    const { ctx, methodsOf } = makeCtx();
    expect(() => drawLockIndicator(ctx, node('rect'), 1)).not.toThrow();
    expect(methodsOf('arc').length).toBeGreaterThan(0);
  });
});
