import { stageIncludesMemory } from '../LepOrchestrator';

describe('stageIncludesMemory', () => {
  it('is true for stages that run Wave 3 (tier 3)', () => {
    expect(stageIncludesMemory('memory')).toBe(true);
    expect(stageIncludesMemory('primary+memory')).toBe(true);
    expect(stageIncludesMemory('all')).toBe(true);
  });

  it('is false for stages that exclude the memory wave', () => {
    expect(stageIncludesMemory('disabled')).toBe(false);
    expect(stageIncludesMemory('sources')).toBe(false);
    expect(stageIncludesMemory('primary')).toBe(false);
  });
});
