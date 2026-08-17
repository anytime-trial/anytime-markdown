import { DEFAULT_LEP_CONFIG, mergeLepConfig, validateLepConfigInput } from '../LepConfig';

describe('LepConfig memory.workspaceScope', () => {
  it("既定は 'own'（自ワークスペース限定）", () => {
    expect(DEFAULT_LEP_CONFIG.memory.workspaceScope).toBe('own');
  });

  it("'all' を警告なしで受け付ける", () => {
    const { value, warnings } = validateLepConfigInput(
      { memory: { workspaceScope: 'all' } },
      'test',
    );
    expect(warnings).toEqual([]);
    expect(value.memory).toEqual({ workspaceScope: 'all' });
  });

  it('不正値は既定へ黙って倒さず、警告を出したうえで無視する', () => {
    const { value, warnings } = validateLepConfigInput(
      { memory: { workspaceScope: 'mine' } },
      'test',
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('memory.workspaceScope');
    expect(value.memory?.workspaceScope).toBeUndefined();
  });

  it('未指定の override は base の値を保つ', () => {
    const base = mergeLepConfig(DEFAULT_LEP_CONFIG, { memory: { workspaceScope: 'all' } });
    expect(base.memory.workspaceScope).toBe('all');
    const merged = mergeLepConfig(base, { memory: { conversation: { backfillDays: 3 } } });
    expect(merged.memory.workspaceScope).toBe('all');
    expect(merged.memory.conversation.backfillDays).toBe(3);
  });
});
