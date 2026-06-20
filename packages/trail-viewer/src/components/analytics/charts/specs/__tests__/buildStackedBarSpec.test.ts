import { buildStackedBarSpec } from '../buildStackedBarSpec';

describe('buildStackedBarSpec', () => {
  it('カテゴリ別系列を stacked bar ChartSpec に変換する', () => {
    const spec = buildStackedBarSpec({
      categories: ['w1', 'w2'],
      series: [
        { name: 'Read', values: [1, 2], color: '#aaa' },
        { name: 'Edit', values: [3, 4], color: '#bbb' },
      ],
      title: 'Tools',
    });
    expect(spec.kind).toBe('bar');
    expect(spec.options?.stacked).toBe(true);
    expect(spec.categories).toEqual(['w1', 'w2']);
    expect(spec.series).toHaveLength(2);
    expect(spec.series[1].values).toEqual([3, 4]);
    expect(spec.series[1].color).toBe('#bbb');
    expect(spec.series[0].type).toBe('bar');
  });

  it('stacked=false で grouped（並列棒）になる', () => {
    const spec = buildStackedBarSpec({
      categories: ['a'],
      series: [{ name: 'X', values: [1] }],
      stacked: false,
    });
    expect(spec.options?.grouped).toBe(true);
    expect(spec.options?.stacked).toBeUndefined();
  });
});
