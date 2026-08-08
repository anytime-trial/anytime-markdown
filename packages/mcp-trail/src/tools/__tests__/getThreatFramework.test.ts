import { GetThreatFrameworkInputSchema, handleGetThreatFramework } from '../getThreatFramework';

describe('get_threat_framework', () => {
  it('引数なしで 5 タクティクス・17 技法の全体を返す', () => {
    const result = handleGetThreatFramework({});
    expect(result.tactics).toHaveLength(5);
    expect(result.tactics.flatMap((t) => t.techniques)).toHaveLength(17);
  });

  it('tactic 指定で当該タクティクスのみ返す', () => {
    const result = handleGetThreatFramework({ tactic: 'operational_impact' });
    expect(result.tactics).toHaveLength(1);
    expect(result.tactics[0].techniques.map((t) => t.id)).toEqual(['ADR.T0016', 'ADR.T0017']);
  });

  it('入力スキーマは未知の tactic を拒否し省略を許容する', () => {
    expect(GetThreatFrameworkInputSchema.safeParse({}).success).toBe(true);
    expect(GetThreatFrameworkInputSchema.safeParse({ tactic: 'permission_abuse' }).success).toBe(true);
    expect(GetThreatFrameworkInputSchema.safeParse({ tactic: 'unknown_tactic' }).success).toBe(false);
  });
});
