import { DEFAULT_DIAGRAM_SPACING, DIAGRAM_SPACING_RANGE, gapBand, spacedGaps } from '../spacing';
import { gapFromDrag } from '../view';
import type { DiagramSpacing } from '../types';

const SPACING = DEFAULT_DIAGRAM_SPACING;

describe('すき間の帯', () => {
  it('列のすき間は箱の右辺から始まり、すき間ぶんの幅を持つ', () => {
    const band = gapBand(SPACING, 'column');
    expect(band.start).toBe(30 + SPACING.nodeWidth);
    expect(band.size).toBe(SPACING.columnGap);
  });

  it('行のすき間は箱の下辺から始まる', () => {
    const band = gapBand(SPACING, 'row');
    expect(band.start).toBe(30 + SPACING.nodeHeight);
    expect(band.size).toBe(SPACING.rowGap);
  });
});

describe('すき間の付け替え', () => {
  it('列だけを変え、他の刻みには触らない', () => {
    const next = spacedGaps(SPACING, { column: 40 });
    expect(next.columnGap).toBe(SPACING.columnGap + 40);
    expect({ ...next, columnGap: SPACING.columnGap }).toEqual(SPACING);
  });

  it('範囲の外は丸める（画面から範囲外の図を作らせない）', () => {
    expect(spacedGaps(SPACING, { column: -9999 }).columnGap).toBe(DIAGRAM_SPACING_RANGE.columnGap.min);
    expect(spacedGaps(SPACING, { row: 9999 }).rowGap).toBe(DIAGRAM_SPACING_RANGE.rowGap.max);
  });

  it('小数は整数へ丸める（升目の座標が端数で揺れない）', () => {
    expect(spacedGaps(SPACING, { column: 0.4 }).columnGap).toBe(SPACING.columnGap);
  });
});

describe('指の動きからのすき間', () => {
  /** 取っ手は**最初のすき間**に居るので、指の動きはすき間の差と 1 対 1 になる。 */
  it('倍率で割った動きぶんだけ広がる', () => {
    const next: DiagramSpacing = gapFromDrag({
      start: SPACING, pointer: { x: 60, y: 0 }, scale: 2, axis: 'column',
    });
    expect(next.columnGap).toBe(SPACING.columnGap + 30);
  });

  it('縦の取っ手は行のすき間だけを変える', () => {
    const next = gapFromDrag({ start: SPACING, pointer: { x: 999, y: -20 }, scale: 1, axis: 'row' });
    expect(next.rowGap).toBe(SPACING.rowGap - 20);
    expect(next.columnGap).toBe(SPACING.columnGap);
  });
});
