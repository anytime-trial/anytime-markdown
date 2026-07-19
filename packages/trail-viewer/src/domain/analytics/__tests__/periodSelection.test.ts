import {
  PERIOD_DAYS_DEFAULT,
  PERIOD_DAYS_MAX,
  PERIOD_DAYS_MIN,
  clampPeriodDays,
  resolveCombinedRangeDays,
} from '../periodSelection';

describe('clampPeriodDays', () => {
  it('有効範囲内の整数はそのまま返す', () => {
    expect(clampPeriodDays(1)).toBe(1);
    expect(clampPeriodDays(30)).toBe(30);
    expect(clampPeriodDays(365)).toBe(365);
  });

  it('下限未満は下限へ丸める', () => {
    expect(clampPeriodDays(0)).toBe(PERIOD_DAYS_MIN);
    expect(clampPeriodDays(-10)).toBe(PERIOD_DAYS_MIN);
  });

  it('上限超過は上限へ丸める', () => {
    expect(clampPeriodDays(366)).toBe(PERIOD_DAYS_MAX);
    expect(clampPeriodDays(100_000)).toBe(PERIOD_DAYS_MAX);
  });

  it('小数は四捨五入する', () => {
    expect(clampPeriodDays(30.4)).toBe(30);
    expect(clampPeriodDays(30.6)).toBe(31);
  });

  it('非数値（空入力の NaN・Infinity）は既定値へ落とす', () => {
    expect(clampPeriodDays(Number.NaN)).toBe(PERIOD_DAYS_DEFAULT);
    expect(clampPeriodDays(Number.POSITIVE_INFINITY)).toBe(PERIOD_DAYS_DEFAULT);
  });
});

describe('resolveCombinedRangeDays', () => {
  // 累積コミットの baseline は「表示窓より前の行」に依存するため、短い表示期間でも
  // 最低 30 日分を取得する（axisInfo.ts の commitRowsPreWindow）。
  it('30 日未満の表示期間でも 30 日分を取得する', () => {
    expect(resolveCombinedRangeDays(1)).toBe(30);
    expect(resolveCombinedRangeDays(7)).toBe(30);
    expect(resolveCombinedRangeDays(29)).toBe(30);
  });

  it('30 日以上は表示期間をそのまま取得範囲にする', () => {
    expect(resolveCombinedRangeDays(30)).toBe(30);
    expect(resolveCombinedRangeDays(45)).toBe(45);
    expect(resolveCombinedRangeDays(365)).toBe(365);
  });
});
