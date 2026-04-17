import { computeClaudeActivityColorMap, computeMultiAgentColorMap, computeConflictBorderMap } from '../claudeActivityColorMap';

describe('computeClaudeActivityColorMap', () => {
  it('active要素はオレンジ色を返す', () => {
    const map = computeClaudeActivityColorMap(['el_a'], [], [], true);
    expect(map.get('el_a')).toBeDefined();
    expect(map.get('el_a')).toMatch(/^rgba/);
  });

  it('touched要素は水色を返す', () => {
    const map = computeClaudeActivityColorMap([], ['el_b'], [], true);
    expect(map.get('el_b')).toBeDefined();
  });

  it('active が touched より優先される', () => {
    const active = computeClaudeActivityColorMap(['el_a'], ['el_a'], [], true);
    const touchedOnly = computeClaudeActivityColorMap([], ['el_a'], [], true);
    expect(active.get('el_a')).not.toBe(touchedOnly.get('el_a'));
  });

  it('どちらにも含まれない要素はマップに存在しない', () => {
    const map = computeClaudeActivityColorMap(['el_a'], ['el_b'], [], true);
    expect(map.has('el_c')).toBe(false);
  });

  it('両配列が空のとき空マップを返す', () => {
    const map = computeClaudeActivityColorMap([], [], [], true);
    expect(map.size).toBe(0);
  });

  it('planned要素は紫色を返す', () => {
    const map = computeClaudeActivityColorMap([], [], ['el_c'], true);
    expect(map.get('el_c')).toBeDefined();
    expect(map.get('el_c')).toMatch(/^rgba/);
  });

  it('active が planned より優先される', () => {
    const withActive = computeClaudeActivityColorMap(['el_a'], [], ['el_a'], true);
    const plannedOnly = computeClaudeActivityColorMap([], [], ['el_a'], true);
    expect(withActive.get('el_a')).not.toBe(plannedOnly.get('el_a'));
  });

  it('touched が planned より優先される', () => {
    const withTouched = computeClaudeActivityColorMap([], ['el_a'], ['el_a'], true);
    const plannedOnly = computeClaudeActivityColorMap([], [], ['el_a'], true);
    expect(withTouched.get('el_a')).not.toBe(plannedOnly.get('el_a'));
  });

  it('全配列が空のとき空マップを返す（3引数版）', () => {
    const map = computeClaudeActivityColorMap([], [], [], true);
    expect(map.size).toBe(0);
  });
});

describe('computeMultiAgentColorMap', () => {
  it('2エージェントの active 要素に異なる色を割り当てる', () => {
    const map = computeMultiAgentColorMap([
      { sessionId: 'a', activeElementIds: ['el_a'], touchedElementIds: [], plannedElementIds: [] },
      { sessionId: 'b', activeElementIds: ['el_b'], touchedElementIds: [], plannedElementIds: [] },
    ], true);
    expect(map.get('el_a')).toBeDefined();
    expect(map.get('el_b')).toBeDefined();
    expect(map.get('el_a')).not.toBe(map.get('el_b'));
  });

  it('同一要素を複数エージェントが触れた場合、後のエージェントが優先', () => {
    const map = computeMultiAgentColorMap([
      { sessionId: 'a', activeElementIds: ['el_x'], touchedElementIds: [], plannedElementIds: [] },
      { sessionId: 'b', activeElementIds: ['el_x'], touchedElementIds: [], plannedElementIds: [] },
    ], true);
    expect(map.get('el_x')).toBeDefined();
  });

  it('空の agents 配列で空マップを返す', () => {
    const map = computeMultiAgentColorMap([], true);
    expect(map.size).toBe(0);
  });

  it('touched は active より薄い色（同一エージェント内）', () => {
    const map = computeMultiAgentColorMap([
      { sessionId: 'a', activeElementIds: ['el_a'], touchedElementIds: ['el_b'], plannedElementIds: [] },
    ], true);
    const activeColor = map.get('el_a')!;
    const touchedColor = map.get('el_b')!;
    expect(activeColor).not.toBe(touchedColor);
  });
});

describe('computeConflictBorderMap', () => {
  it('衝突ノードに赤枠色を返す', () => {
    const map = computeConflictBorderMap([
      { file: '/a.ts', elementIds: ['el_a', 'el_b'], agentSessionIds: ['s1', 's2'], isActiveConflict: true },
    ]);
    expect(map.get('el_a')).toBeDefined();
    expect(map.get('el_b')).toBeDefined();
  });

  it('isActiveConflict=true は実線色、false は点線色', () => {
    const active = computeConflictBorderMap([
      { file: '/a.ts', elementIds: ['el_a'], agentSessionIds: ['s1', 's2'], isActiveConflict: true },
    ]);
    const touched = computeConflictBorderMap([
      { file: '/b.ts', elementIds: ['el_b'], agentSessionIds: ['s1', 's2'], isActiveConflict: false },
    ]);
    expect(active.get('el_a')).not.toBe(touched.get('el_b'));
  });

  it('空の conflicts で空マップを返す', () => {
    const map = computeConflictBorderMap([]);
    expect(map.size).toBe(0);
  });
});
