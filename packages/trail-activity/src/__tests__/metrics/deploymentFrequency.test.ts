import { computeDeploymentFrequency } from '../../domain/metrics/deploymentFrequency';
import type { DateRange } from '../../domain/metrics/types';

const range: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };
const prevRange: DateRange = { from: '2026-03-01T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' };

describe('computeDeploymentFrequency', () => {
  it('0 releases → value=0, level=low', () => {
    const result = computeDeploymentFrequency([], range, prevRange, 'week');
    expect(result.value).toBe(0);
    expect(result.sampleSize).toBe(0);
    expect(result.level).toBe('low');
    expect(result.id).toBe('deploymentFrequency');
    expect(result.unit).toBe('perDay');
  });

  it('single release in period → value = 1/days', () => {
    const releases = [{ tag_date: '2026-04-15T12:00:00.000Z' }];
    const result = computeDeploymentFrequency(releases, range, prevRange, 'day');
    const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
    expect(result.value).toBeCloseTo(1 / days, 5);
    expect(result.sampleSize).toBe(1);
  });

  it('multiple releases → correct count', () => {
    const releases = [
      { tag_date: '2026-04-05T00:00:00.000Z' },
      { tag_date: '2026-04-10T00:00:00.000Z' },
      { tag_date: '2026-04-20T00:00:00.000Z' },
    ];
    const result = computeDeploymentFrequency(releases, range, prevRange, 'week');
    const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
    expect(result.value).toBeCloseTo(3 / days, 5);
    expect(result.sampleSize).toBe(3);
  });

  it('release exactly on range boundary (from) is included', () => {
    const releases = [{ tag_date: range.from }];
    const result = computeDeploymentFrequency(releases, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
  });

  it('release exactly on range boundary (to) is included', () => {
    const releases = [{ tag_date: range.to }];
    const result = computeDeploymentFrequency(releases, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
  });

  it('release outside range is excluded', () => {
    const releases = [
      { tag_date: '2026-03-31T23:59:59.999Z' },
      { tag_date: '2026-05-01T00:00:00.000Z' },
    ];
    const result = computeDeploymentFrequency(releases, range, prevRange, 'day');
    expect(result.sampleSize).toBe(0);
  });

  it('deltaPct calculated from previous period', () => {
    const releases = [{ tag_date: '2026-04-10T00:00:00.000Z' }];
    const prevReleases = [
      { tag_date: '2026-03-10T00:00:00.000Z' },
      { tag_date: '2026-03-20T00:00:00.000Z' },
    ];
    // prevRange is passed to the same function as releases;
    // computeDeploymentFrequency receives current releases AND previousPeriodCount
    const result = computeDeploymentFrequency(releases, range, prevRange, 'day', prevReleases);
    expect(result.comparison).toBeDefined();
    expect(result.comparison!.deltaPct).not.toBeNull();
  });

  it('deltaPct=null when previous period has 0 releases', () => {
    const releases = [{ tag_date: '2026-04-10T00:00:00.000Z' }];
    const result = computeDeploymentFrequency(releases, range, prevRange, 'day', []);
    expect(result.comparison!.deltaPct).toBeNull();
  });

  it('produces daily timeSeries for day bucket', () => {
    const shortRange: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-07T23:59:59.999Z' };
    const shortPrev: DateRange = { from: '2026-03-25T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' };
    const releases = [{ tag_date: '2026-04-03T00:00:00.000Z' }];
    const result = computeDeploymentFrequency(releases, shortRange, shortPrev, 'day');
    expect(result.timeSeries.length).toBeGreaterThan(0);
    expect(result.timeSeries[0]).toHaveProperty('bucketStart');
    expect(result.timeSeries[0]).toHaveProperty('value');
  });

  it('produces weekly timeSeries for week bucket', () => {
    const releases = [{ tag_date: '2026-04-10T00:00:00.000Z' }];
    const result = computeDeploymentFrequency(releases, range, prevRange, 'week');
    expect(result.timeSeries.length).toBeGreaterThan(0);
  });
});
