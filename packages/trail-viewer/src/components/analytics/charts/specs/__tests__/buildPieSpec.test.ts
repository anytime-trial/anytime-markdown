import { buildPieSpec } from '../buildPieSpec';

describe('buildPieSpec', () => {
  it('ラベルと値の配列を donut ChartSpec に変換する（色は自動パレット）', () => {
    const spec = buildPieSpec(
      [
        { label: 'Read', value: 10 },
        { label: 'Edit', value: 5 },
      ],
      'Tool usage',
    );
    expect(spec.kind).toBe('pie');
    expect(spec.options?.donut).toBe(true);
    expect(spec.title).toBe('Tool usage');
    expect(spec.series).toHaveLength(1);
    expect(spec.series[0].values).toEqual([10, 5]);
    expect(spec.categories).toEqual(['Read', 'Edit']);
  });

  it('空配列でも例外を投げない', () => {
    const spec = buildPieSpec([]);
    expect(spec.categories).toEqual([]);
    expect(spec.series[0].values).toEqual([]);
  });
});
