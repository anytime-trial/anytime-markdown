import { normalizeSnapshotIntervalMs, retentionCutoffIso } from '../workSnapshotSchedule';

describe('normalizeSnapshotIntervalMs', () => {
  it('0 は無効（null）', () => {
    expect(normalizeSnapshotIntervalMs(0)).toBeNull();
  });

  it('5 未満は 5 分へ切り上げる（過剰なスナップショットを防ぐ）', () => {
    expect(normalizeSnapshotIntervalMs(1)).toBe(5 * 60 * 1000);
    expect(normalizeSnapshotIntervalMs(4)).toBe(5 * 60 * 1000);
  });

  it('既定値 15 分', () => {
    expect(normalizeSnapshotIntervalMs(15)).toBe(15 * 60 * 1000);
  });

  it('60 分を超えたら 60 分に丸める', () => {
    expect(normalizeSnapshotIntervalMs(120)).toBe(60 * 60 * 1000);
  });

  it('負値・NaN は無効', () => {
    expect(normalizeSnapshotIntervalMs(-1)).toBeNull();
    expect(normalizeSnapshotIntervalMs(Number.NaN)).toBeNull();
  });
});

describe('retentionCutoffIso', () => {
  it('保持日数を引いた UTC ISO を返す', () => {
    expect(retentionCutoffIso('2026-07-13T05:00:00.000Z', 7)).toBe('2026-07-06T05:00:00.000Z');
  });
});
