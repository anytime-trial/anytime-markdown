import { diagramShapeOf, shapeOutline, SHAPE_OUTLINE_INSET, shapeTextInset } from '../shapes';
import { SAMPLE } from './fixture';

/** 検査は 200 × 100 の箱で行う。正方形にすると、幅と高さを取り違えた実装が通ってしまう。 */
const W = 200;
const H = 100;

describe('diagramShapeOf', () => {
  it('書いていない要素は四角', () => {
    expect(diagramShapeOf(SAMPLE, '祖父')).toBe('rect');
  });

  it('書いてある要素はその形', () => {
    const document = { ...SAMPLE, shapes: { 祖父: 'diamond' } } as const;
    expect(diagramShapeOf(document, '祖父')).toBe('diamond');
  });
});

describe('shapeOutline', () => {
  it('border-radius だけで描ける形は null（札自身が描く）', () => {
    for (const shape of ['rect', 'round', 'stadium', 'circle'] as const) {
      expect(shapeOutline(shape, W, H)).toBeNull();
    }
  });

  it('ひし形は 4 辺の中点を結ぶ', () => {
    expect(shapeOutline('diamond', W, H)).toEqual({
      outline: 'M 100 1 L 199 50 L 100 99 L 1 50 Z',
      detail: null,
    });
  });

  it('平行四辺形は上辺を右へずらす', () => {
    expect(shapeOutline('parallelogram', W, H)?.outline).toBe('M 50 1 L 199 1 L 150 99 L 1 99 Z');
  });

  it('六角形は左右に頂点を出す', () => {
    expect(shapeOutline('hexagon', W, H)?.outline).toBe('M 50 1 L 150 1 L 199 50 L 150 99 L 50 99 L 1 50 Z');
  });

  it('円筒は本体の輪郭と、蓋の弧を分けて返す', () => {
    expect(shapeOutline('cylinder', W, H)).toEqual({
      outline: 'M 1 15 A 99 14 0 0 1 199 15 L 199 85 A 99 14 0 0 1 1 85 Z',
      detail: 'M 1 15 A 99 14 0 0 0 199 15',
    });
  });

  it('輪郭は箱の内側へ寄せる（編集中の札は overflow: hidden で線の外半分が切られる）', () => {
    const outline = shapeOutline('diamond', W, H)!.outline;
    expect(outline).toContain(`${SHAPE_OUTLINE_INSET} ${H / 2}`);
    expect(outline).not.toContain('M 100 0');
  });

  it('寸法が 0 以下でも例外にならず、潰れた形を返す', () => {
    for (const shape of ['diamond', 'parallelogram', 'hexagon', 'cylinder'] as const) {
      expect(() => shapeOutline(shape, 0, 0)).not.toThrow();
      expect(shapeOutline(shape, 0, 0)?.outline).toMatch(/^M /);
      expect(shapeOutline(shape, -10, -10)?.outline).not.toContain('NaN');
    }
  });
});

describe('shapeTextInset', () => {
  it('四角と角丸は既定の余白のまま', () => {
    expect(shapeTextInset('rect', W, H)).toEqual({ x: 8, y: 4 });
    expect(shapeTextInset('round', W, H)).toEqual({ x: 8, y: 4 });
  });

  it('ひし形は四隅が欠けるので縦横ともに逃がす', () => {
    expect(shapeTextInset('diamond', W, H)).toEqual({ x: 44, y: 14 });
  });

  it('札の大きさに比例する（百分率の CSS では表せない）', () => {
    expect(shapeTextInset('diamond', W * 2, H * 2)).toEqual({ x: 88, y: 28 });
  });

  it('細い札でも四角の余白を下回らない（字が枠に貼り付かない）', () => {
    expect(shapeTextInset('hexagon', 20, 20)).toEqual({ x: 8, y: 4 });
  });
});
