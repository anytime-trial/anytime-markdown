import { computeDeadCodeScore } from '../computeDeadCodeScore';
import type { DeadCodeSignals } from '../types';

describe('computeDeadCodeScore', () => {
  const baseSignals: DeadCodeSignals = {
    orphan: false, fanInZero: false, noRecentChurn: false,
    zeroCoverage: false, isolatedCommunity: false,
  };

  it('全信号 false なら 0', () => {
    expect(computeDeadCodeScore(baseSignals, false)).toBe(0);
  });

  it('orphan のみで 45', () => {
    expect(computeDeadCodeScore({ ...baseSignals, orphan: true }, false)).toBe(45);
  });

  it('全信号 true で 100', () => {
    expect(computeDeadCodeScore({
      ...baseSignals, orphan: true, fanInZero: true, noRecentChurn: true,
      zeroCoverage: true, isolatedCommunity: true,
    }, false)).toBe(100);
  });

  it('isIgnored が true ならスコアは常に 0', () => {
    expect(computeDeadCodeScore({ ...baseSignals, orphan: true, fanInZero: true }, true)).toBe(0);
  });

  it('orphan + noRecentChurn = 60 (要確認帯)', () => {
    expect(computeDeadCodeScore({ ...baseSignals, orphan: true, noRecentChurn: true }, false)).toBe(60);
  });
});
