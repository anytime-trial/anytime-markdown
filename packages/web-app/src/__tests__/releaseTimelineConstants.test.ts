import {
  fillMonthGaps,
  formatDayLabel,
  formatFullDate,
  formatMonth,
} from '../app/[locale]/timeline/constants';
import type { MonthlyReleaseCount } from '../lib/releaseTimeline/types';

function month(m: string, cli: number, model = 0): MonthlyReleaseCount {
  return { month: m, cli, model };
}

describe('formatMonth / formatDayLabel / formatFullDate', () => {
  it('0 埋めを外して日本語表記にする', () => {
    expect(formatMonth('2026-04')).toBe('2026年4月');
    expect(formatDayLabel('2026-04-06')).toBe('4/6');
    expect(formatFullDate('2026-04-06')).toBe('2026年4月6日');
  });

  it('壊れた入力は変換せずそのまま返す（黙って別の日付にしない）', () => {
    expect(formatMonth('2026/04')).toBe('2026/04');
    expect(formatDayLabel('not-a-date')).toBe('not-a-date');
    expect(formatFullDate('2026-04')).toBe('2026-04');
  });
});

describe('fillMonthGaps', () => {
  it('欠測月を 0 件で埋める', () => {
    expect(fillMonthGaps([month('2026-03', 2), month('2026-06', 1)])).toEqual([
      month('2026-03', 2),
      month('2026-04', 0),
      month('2026-05', 0),
      month('2026-06', 1),
    ]);
  });

  it('年をまたぐ欠測を埋める', () => {
    expect(fillMonthGaps([month('2026-11', 1), month('2027-02', 3)]).map((m) => m.month)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('連続していれば元の配列と同じ内容になる', () => {
    const months = [month('2026-04', 1), month('2026-05', 2)];
    expect(fillMonthGaps(months)).toEqual(months);
  });

  it('空配列と単月を壊さない', () => {
    expect(fillMonthGaps([])).toEqual([]);
    expect(fillMonthGaps([month('2026-04', 1)])).toEqual([month('2026-04', 1)]);
  });
});
