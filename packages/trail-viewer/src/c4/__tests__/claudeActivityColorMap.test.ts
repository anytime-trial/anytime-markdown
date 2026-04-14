import { computeClaudeActivityColorMap } from '../claudeActivityColorMap';

describe('computeClaudeActivityColorMap', () => {
  it('active要素はオレンジ色を返す', () => {
    const map = computeClaudeActivityColorMap(['el_a'], [], true);
    expect(map.get('el_a')).toBeDefined();
    expect(map.get('el_a')).toMatch(/^rgba/);
  });

  it('touched要素は水色を返す', () => {
    const map = computeClaudeActivityColorMap([], ['el_b'], true);
    expect(map.get('el_b')).toBeDefined();
  });

  it('active が touched より優先される', () => {
    const active = computeClaudeActivityColorMap(['el_a'], ['el_a'], true);
    const touchedOnly = computeClaudeActivityColorMap([], ['el_a'], true);
    expect(active.get('el_a')).not.toBe(touchedOnly.get('el_a'));
  });

  it('どちらにも含まれない要素はマップに存在しない', () => {
    const map = computeClaudeActivityColorMap(['el_a'], ['el_b'], true);
    expect(map.has('el_c')).toBe(false);
  });

  it('両配列が空のとき空マップを返す', () => {
    const map = computeClaudeActivityColorMap([], [], true);
    expect(map.size).toBe(0);
  });
});
