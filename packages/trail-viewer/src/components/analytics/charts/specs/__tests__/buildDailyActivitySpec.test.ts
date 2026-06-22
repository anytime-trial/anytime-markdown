import { buildDailyActivitySpec, type DailyActivityRow } from '../buildDailyActivitySpec';

const colors = {
  input: '#1', output: '#2', cacheRead: '#3', cacheWrite: '#4',
  primary: '#5', skill: '#6', overlayPerLoc: '#7',
};
const barLabels = { input: 'Input', output: 'Output', cacheRead: 'CR', cacheWrite: 'CW', current: 'Current', optimized: 'Optimized' };

const row = (over: number | null): DailyActivityRow => ({
  date: '06-01', inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheCreationTokens: 4,
  actualCost: 9, skillCost: 8, overlayValue: over,
});

describe('buildDailyActivitySpec', () => {
  it('tokens モードは4トークン系列の積み上げ棒 + 右軸 overlay 折れ線', () => {
    const spec = buildDailyActivitySpec([row(5)], { isTokens: true, hasOverlay: true, overlayLabel: 'tok/LOC', colors, barLabels });
    expect(spec.kind).toBe('combo');
    expect(spec.options?.stacked).toBe(true);
    const bars = spec.series.filter((s) => s.type === 'bar');
    expect(bars).toHaveLength(4);
    const line = spec.series.find((s) => s.type === 'line');
    expect(line?.axis).toBe('right');
    expect(line?.values).toEqual([5]);
    expect(spec.options?.yAxisRight?.label).toBe('tok/LOC');
  });

  it('cost モードは2系列の並列棒（stacked=false）', () => {
    const spec = buildDailyActivitySpec([row(null)], { isTokens: false, hasOverlay: false, overlayLabel: '$/LOC', colors, barLabels });
    expect(spec.options?.stacked).toBe(false);
    expect(spec.series.filter((s) => s.type === 'bar')).toHaveLength(2);
    expect(spec.series.some((s) => s.type === 'line')).toBe(false);
  });
});
