import { computeVisibleRange } from '../computeVisibleRange';

describe('computeVisibleRange', () => {
  it('returns [0,0] for total=0', () => {
    expect(computeVisibleRange(0, 480, 24, 0)).toEqual([0, 0]);
  });

  it('returns [0,total] when rowHeight is invalid', () => {
    expect(computeVisibleRange(0, 480, 0, 100)).toEqual([0, 100]);
    expect(computeVisibleRange(0, 480, -1, 100)).toEqual([0, 100]);
  });

  it('returns full visible range at scrollTop=0 with overscan', () => {
    // clientHeight=240 / rowHeight=24 → 10 行 visible
    // overscan 10 を上下に追加 → start=0 (already 0), end=10+10=20
    const [start, end] = computeVisibleRange(0, 240, 24, 1000, 10);
    expect(start).toBe(0);
    expect(end).toBe(20);
  });

  it('shifts the window as scrollTop increases', () => {
    // scrollTop=240 (= 10 行分) / clientHeight=240 / rowHeight=24
    // start = max(0, 10 - 10) = 0
    // end   = min(1000, ceil((240+240)/24) + 10) = min(1000, 20+10) = 30
    const [start, end] = computeVisibleRange(240, 240, 24, 1000, 10);
    expect(start).toBe(0);
    expect(end).toBe(30);

    // scrollTop=2400 (= 100 行スクロール)
    // start = max(0, 100 - 10) = 90
    // end   = min(1000, ceil((2400+240)/24) + 10) = min(1000, 110+10) = 120
    const [s2, e2] = computeVisibleRange(2400, 240, 24, 1000, 10);
    expect(s2).toBe(90);
    expect(e2).toBe(120);
  });

  it('clamps end to total when near the bottom', () => {
    // total=50, scrollTop=1000 (実質スクロール最大付近)
    const [start, end] = computeVisibleRange(1000, 240, 24, 50, 10);
    expect(end).toBe(50);
    expect(start).toBeLessThanOrEqual(end);
  });

  it('clamps negative scrollTop to 0', () => {
    const [start, end] = computeVisibleRange(-100, 240, 24, 100, 5);
    expect(start).toBe(0);
    expect(end).toBe(15);
  });

  it('uses the provided overscan', () => {
    const [start0, end0] = computeVisibleRange(0, 240, 24, 1000, 0);
    expect(start0).toBe(0);
    expect(end0).toBe(10);

    const [start20, end20] = computeVisibleRange(2400, 240, 24, 1000, 20);
    expect(start20).toBe(80);
    expect(end20).toBe(130);
  });
});
