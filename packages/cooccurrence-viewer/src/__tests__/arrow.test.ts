import { arrowHeadLength, arrowHeadPoints } from '../render/arrow';
import { ARROW_HEAD_MAX, ARROW_HEAD_MIN, ARROW_TIP_GAP } from '../render/scales';

describe('arrowHeadPoints', () => {
  const source = { x: 0, y: 0 };
  const target = { x: 100, y: 0 };

  it('矢頭の頂点を向き先の円周の手前に置く', () => {
    const head = arrowHeadPoints(source, target, 10, 4);
    expect(head.tip.x).toBeCloseTo(100 - (10 + ARROW_TIP_GAP));
    expect(head.tip.y).toBeCloseTo(0);
  });

  it('左右の羽が線を挟んで対称になる', () => {
    const head = arrowHeadPoints(source, target, 10, 4);
    expect(head.left.y).toBeCloseTo(-head.right.y);
    expect(head.left.x).toBeCloseTo(head.right.x);
  });

  it('羽は頂点より後方（source 側）にある', () => {
    const head = arrowHeadPoints(source, target, 10, 4);
    expect(head.left.x).toBeLessThan(head.tip.x);
    expect(head.right.x).toBeLessThan(head.tip.x);
  });

  it('斜めの線でも円周の手前に置く', () => {
    // 3-4-5 の直角三角形。中心間距離は 50。
    const head = arrowHeadPoints({ x: 0, y: 0 }, { x: 30, y: 40 }, 10, 4);
    expect(Math.hypot(30 - head.tip.x, 40 - head.tip.y)).toBeCloseTo(10 + ARROW_TIP_GAP);
  });

  it('向きを反転すると頂点が反対側へ移る', () => {
    const forward = arrowHeadPoints(source, target, 10, 4);
    const backward = arrowHeadPoints(target, source, 10, 4);
    expect(backward.tip.x).toBeCloseTo(10 + ARROW_TIP_GAP);
    expect(backward.tip.x).toBeLessThan(forward.tip.x);
  });

  it('端点が重なっていても NaN を返さない', () => {
    const head = arrowHeadPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 10, 4);
    for (const point of [head.tip, head.left, head.right]) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });
});

describe('arrowHeadLength', () => {
  it('線が太いほど矢頭が大きい', () => {
    expect(arrowHeadLength(4)).toBeGreaterThan(arrowHeadLength(2.5));
  });

  it('細い線でも下限を下回らない', () => {
    // 太さは強度の符号であり、向きは別の符号である。細い共起でも向きは同じ精度で読める
    // 必要がある（設計書 §3.1）。
    expect(arrowHeadLength(0.5)).toBe(ARROW_HEAD_MIN);
  });

  it('太い線でも上限を超えない', () => {
    expect(arrowHeadLength(100)).toBe(ARROW_HEAD_MAX);
  });
});
