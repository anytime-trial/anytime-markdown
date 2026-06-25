import { formatAge } from '../providers/AgentMappingItem';

describe('formatAge', () => {
  it('60 秒未満は秒表示', () => {
    expect(formatAge(0)).toBe('0 sec ago');
    expect(formatAge(30)).toBe('30 sec ago');
    expect(formatAge(59)).toBe('59 sec ago');
  });

  it('60 分未満は分表示', () => {
    expect(formatAge(60)).toBe('1 min ago');
    expect(formatAge(1500)).toBe('25 min ago');
    expect(formatAge(3540)).toBe('59 min ago');
  });

  it('60 分以上は h min 表示', () => {
    expect(formatAge(3600)).toBe('1h 0min ago');
    expect(formatAge(3660)).toBe('1h 1min ago');
    expect(formatAge(8100)).toBe('2h 15min ago');
  });

  it('数時間以上も h min で表現', () => {
    expect(formatAge(90000)).toBe('25h 0min ago');
  });
});
