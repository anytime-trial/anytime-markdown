import { computeVisibleWindow } from '../ui/virtualList';

describe('computeVisibleWindow', () => {
  it('includes rows intersecting the scroll position', () => {
    const window = computeVisibleWindow(100, 20, 95, 40, 1);
    expect(window.startIndex).toBeLessThanOrEqual(4);
    expect(window.endIndex).toBeGreaterThan(4);
    expect(window.startIndex).toBeLessThanOrEqual(window.endIndex);
    expect(window.endIndex).toBeLessThanOrEqual(100);
  });

  it('does not exceed the row count upper bound', () => {
    const window = computeVisibleWindow(1000, 20, 400, 100, 3);
    expect(window.endIndex - window.startIndex).toBeLessThanOrEqual(Math.ceil(100 / 20) + 2 * 3 + 1);
  });

  it('keeps rendered row count stable when item count grows by 10x', () => {
    const small = computeVisibleWindow(100, 20, 400, 100, 3);
    const large = computeVisibleWindow(1000, 20, 400, 100, 3);
    expect(large.endIndex - large.startIndex).toBe(small.endIndex - small.startIndex);
  });

  it('returns safe windows for degenerate inputs', () => {
    expect(() => computeVisibleWindow(0, 20, 0, 100, 2)).not.toThrow();
    expect(() => computeVisibleWindow(10, 0, 0, 100, 2)).not.toThrow();
    expect(() => computeVisibleWindow(10, 20, 0, 0, 2)).not.toThrow();
    expect(computeVisibleWindow(10, 0, 0, 100, 2)).toEqual({ startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 });
  });
});
