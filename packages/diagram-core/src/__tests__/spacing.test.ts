/**
 * 刻み（箱の大きさ・すき間）の読み取りと、掴んで引いたときの追従。
 *
 * 移植元は anytime-travel の `tests/genealogy-grid-edit.test.tsx` の「箱の大きさ」の節。
 */

import {
  DEFAULT_DIAGRAM_SPACING,
  DIAGRAM_SPACING_RANGE,
  cellFromPoint,
  cellLimit,
  cellPosition,
  columnPitch,
  isDefaultDiagramSpacing,
  readDiagramSpacing,
  resizedSpacing,
  rowPitch,
} from '../spacing';
import { resizeFromDrag } from '../view';
import type { GridCell } from '../grid';

describe('箱の大きさ', () => {
  const start = DEFAULT_DIAGRAM_SPACING;

  it('引いた量だけ幅・高さが変わり、すき間は動かない', () => {
    const wider = resizedSpacing(start, { x: 40, y: 20 }, { width: true, height: true });
    expect(wider.nodeWidth).toBe(start.nodeWidth + 40);
    expect(wider.nodeHeight).toBe(start.nodeHeight + 20);
    // 箱と一緒にすき間まで伸ばすと、幅を変えただけで列の間隔が二重に広がる。
    expect(wider.columnGap).toBe(start.columnGap);
    expect(wider.rowGap).toBe(start.rowGap);
  });

  it('掴んだ辺だけが効く', () => {
    expect(resizedSpacing(start, { x: 40, y: 20 }, { width: true, height: false }))
      .toEqual({ ...start, nodeWidth: start.nodeWidth + 40 });
    expect(resizedSpacing(start, { x: 40, y: 20 }, { width: false, height: true }))
      .toEqual({ ...start, nodeHeight: start.nodeHeight + 20 });
  });

  it('範囲の外は端で止め、整数へ丸める', () => {
    const range = DIAGRAM_SPACING_RANGE;
    expect(resizedSpacing(start, { x: -9999, y: -9999 }, { width: true, height: true }))
      .toEqual({ ...start, nodeWidth: range.nodeWidth.min, nodeHeight: range.nodeHeight.min });
    expect(resizedSpacing(start, { x: 9999, y: 9999 }, { width: true, height: true }))
      .toEqual({ ...start, nodeWidth: range.nodeWidth.max, nodeHeight: range.nodeHeight.max });
    expect(resizedSpacing(start, { x: 1.4, y: 1.6 }, { width: true, height: true }))
      .toEqual({ ...start, nodeWidth: start.nodeWidth + 1, nodeHeight: start.nodeHeight + 2 });
  });

  it('端で止まった後に戻すと、指の動きにそのまま追う', () => {
    // 1 フレームぶんの差を積んでいくと、止まっていた間の差が消えて箱が指から離れる。
    const overshoot = resizedSpacing(start, { x: 9999, y: 0 }, { width: true, height: false });
    expect(overshoot.nodeWidth).toBe(DIAGRAM_SPACING_RANGE.nodeWidth.max);
    expect(resizedSpacing(start, { x: 10, y: 0 }, { width: true, height: false }).nodeWidth)
      .toBe(start.nodeWidth + 10);
  });
});

describe('箱の大きさと指の追従', () => {
  /** 取っ手の居る箱の右辺・下辺の座標（図の px）。 */
  const edges = (spacing: typeof DEFAULT_DIAGRAM_SPACING, anchor: GridCell) => {
    const { x, y } = cellPosition(spacing, anchor);
    return { right: x + spacing.nodeWidth, bottom: y + spacing.nodeHeight };
  };

  for (const anchor of [{ column: 0, row: 0 }, { column: 1, row: 0 }, { column: 0, row: 1 }, { column: 2, row: 3 }]) {
    it(`左上が (${anchor.column}, ${anchor.row}) でも、縁が指と同じだけ動く`, () => {
      const scale = 0.5;
      const pointer = { x: 30, y: 12 };
      const start = DEFAULT_DIAGRAM_SPACING;
      const next = resizeFromDrag({ start, pointer, scale, anchor, axes: { width: true, height: true } });
      const before = edges(start, anchor);
      const after = edges(next, anchor);
      // 図の px での縁の移動 × 倍率 ＝ 画面の px での指の移動。
      expect((after.right - before.right) * scale).toBeCloseTo(pointer.x, 6);
      expect((after.bottom - before.bottom) * scale).toBeCloseTo(pointer.y, 6);
    });
  }

  it('掴んだ瞬間の倍率で数えるので、同じ引き量なら同じ大きさになる', () => {
    const anchor = { column: 0, row: 0 };
    const axes = { width: true, height: false };
    const start = DEFAULT_DIAGRAM_SPACING;
    // 倍率が小さいほど、同じ指の動きは図の上では大きな差になる。
    expect(resizeFromDrag({ start, pointer: { x: 40, y: 0 }, scale: 1, anchor, axes }).nodeWidth)
      .toBe(start.nodeWidth + 40);
    expect(resizeFromDrag({ start, pointer: { x: 40, y: 0 }, scale: 0.5, anchor, axes }).nodeWidth)
      .toBe(start.nodeWidth + 80);
  });
});

describe('刻みの読み取り', () => {
  it('書いていない項目は既定で埋める', () => {
    // 項目を足した日に古い保存値が丸ごと読めなくなると、誰も触っていないのに保存できなくなる。
    expect(readDiagramSpacing({ nodeWidth: 200 }))
      .toEqual({ ...DEFAULT_DIAGRAM_SPACING, nodeWidth: 200 });
  });

  it('書いてある項目が範囲の外なら読めなかったものとして扱う', () => {
    // 既定で埋めると、画面で見た図と保存された図が食い違ったまま気づけない。
    expect(readDiagramSpacing({ nodeWidth: DIAGRAM_SPACING_RANGE.nodeWidth.max + 1 })).toBeNull();
    expect(readDiagramSpacing({ nodeWidth: Number.NaN })).toBeNull();
    expect(readDiagramSpacing('194')).toBeNull();
  });

  it('既定と同じ刻みは「既定」と判定する（未指定も既定）', () => {
    expect(isDefaultDiagramSpacing(undefined)).toBe(true);
    expect(isDefaultDiagramSpacing({ ...DEFAULT_DIAGRAM_SPACING })).toBe(true);
    expect(isDefaultDiagramSpacing({ ...DEFAULT_DIAGRAM_SPACING, rowGap: 69 })).toBe(false);
  });
});

describe('升目の座標', () => {
  it('升目の番号と座標が往復する', () => {
    const spacing = DEFAULT_DIAGRAM_SPACING;
    const cell = { column: 3, row: 4 };
    expect(cellFromPoint(spacing, cellPosition(spacing, cell))).toEqual(cell);
  });

  it('枠の外の座標は 0 で止める', () => {
    expect(cellFromPoint(DEFAULT_DIAGRAM_SPACING, { x: -9999, y: -9999 })).toEqual({ column: 0, row: 0 });
  });

  it('升目の番号の上限は刻みから導く（刻みを広げても描かれる座標の上限は変わらない）', () => {
    const wide = { ...DEFAULT_DIAGRAM_SPACING, columnGap: DIAGRAM_SPACING_RANGE.columnGap.max };
    expect(cellLimit(columnPitch(wide))).toBeLessThan(cellLimit(columnPitch(DEFAULT_DIAGRAM_SPACING)));
    expect(cellLimit(rowPitch(DEFAULT_DIAGRAM_SPACING))).toBeGreaterThan(0);
  });
});
