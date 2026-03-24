import { snapToGrid, snapRect } from '../../engine/gridSnap';

describe('snapToGrid', () => {
  it('should snap value to nearest grid multiple', () => {
    expect(snapToGrid(23, 20)).toBe(20);
    expect(snapToGrid(31, 20)).toBe(40);
    expect(snapToGrid(10, 20)).toBe(20);
    expect(snapToGrid(0, 20)).toBe(0);
    expect(snapToGrid(-7, 20)).toBe(0);
    expect(snapToGrid(-13, 20)).toBe(-20);
  });
});

describe('snapRect', () => {
  it('should snap position of a rect', () => {
    const result = snapRect(23, 37, 150, 100, 20);
    expect(result).toEqual({ x: 20, y: 40, width: 150, height: 100 });
  });

  it('should snap size when snapping resize', () => {
    const result = snapRect(20, 40, 153, 97, 20, true);
    expect(result).toEqual({ x: 20, y: 40, width: 160, height: 100 });
  });
});
