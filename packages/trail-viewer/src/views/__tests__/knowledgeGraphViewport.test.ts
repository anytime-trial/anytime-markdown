import { formatBboxParam, shouldRefetchForViewport } from '../knowledgeGraphViewport';

const base = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

describe('shouldRefetchForViewport', () => {
  it('fetches when nothing has been fetched yet', () => {
    expect(shouldRefetchForViewport(null, base)).toBe(true);
  });

  it('does not fetch for a viewport that barely moved', () => {
    expect(shouldRefetchForViewport(base, { minX: 5, minY: 5, maxX: 105, maxY: 105 })).toBe(false);
  });

  it('does not fetch for a zoom smaller than the threshold', () => {
    // 幅 100 → 110（1.10 倍）は閾値 1.25 の内側
    expect(shouldRefetchForViewport(base, { minX: -5, minY: -5, maxX: 105, maxY: 105 })).toBe(false);
  });

  it('fetches when zoomed in past the threshold', () => {
    // 幅 100 → 50（0.5 倍）
    expect(shouldRefetchForViewport(base, { minX: 25, minY: 25, maxX: 75, maxY: 75 })).toBe(true);
  });

  it('fetches when zoomed out past the threshold', () => {
    expect(shouldRefetchForViewport(base, { minX: -50, minY: -50, maxX: 150, maxY: 150 })).toBe(true);
  });

  it('fetches for a pure pan that keeps the same area', () => {
    // 面積は同じで場所だけ動く。面積比だけを見る判定はここを取りこぼす
    expect(shouldRefetchForViewport(base, { minX: 60, minY: 0, maxX: 160, maxY: 100 })).toBe(true);
  });

  it('detects a vertical pan as well as a horizontal one', () => {
    expect(shouldRefetchForViewport(base, { minX: 0, minY: 60, maxX: 100, maxY: 160 })).toBe(true);
  });

  it('fetches when the previous box is degenerate (幅 0 は基準にできない)', () => {
    expect(shouldRefetchForViewport({ minX: 5, minY: 0, maxX: 5, maxY: 100 }, base)).toBe(true);
  });
});

describe('formatBboxParam', () => {
  it('serialises as minX,minY,maxX,maxY', () => {
    expect(formatBboxParam({ minX: -10.5, minY: -30, maxX: 20, maxY: 10 })).toBe('-10.5,-30,20,10');
  });
});
