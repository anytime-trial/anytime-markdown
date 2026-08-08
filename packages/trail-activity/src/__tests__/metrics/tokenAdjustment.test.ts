import {
  tokenFactor,
  tokenMissingRate,
  applyTokenFactor,
} from '../../domain/metrics/tokenAdjustment';

describe('tokenFactor', () => {
  it('normal: total=10, missing=2 → factor=10/8=1.25', () => {
    expect(tokenFactor(10, 2)).toBeCloseTo(1.25);
  });

  it('all_observed: total=10, missing=0 → factor=1', () => {
    expect(tokenFactor(10, 0)).toBe(1);
  });

  it('all_missing: total=10, missing=10 → factor=1（補正不能）', () => {
    expect(tokenFactor(10, 10)).toBe(1);
  });

  it('empty: total=0, missing=0 → factor=1', () => {
    expect(tokenFactor(0, 0)).toBe(1);
  });

  it('over_missing（防御的）: total=5, missing=7 → factor=1', () => {
    expect(tokenFactor(5, 7)).toBe(1);
  });
});

describe('tokenMissingRate', () => {
  it('normal: total=10, missing=2 → missingRate=0.2', () => {
    expect(tokenMissingRate({ totalTurns: 10, missingTurns: 2 })).toBeCloseTo(0.2);
  });

  it('empty: total=0, missing=0 → missingRate=0', () => {
    expect(tokenMissingRate({ totalTurns: 0, missingTurns: 0 })).toBe(0);
  });

  it('all_missing: total=10, missing=10 → missingRate=1', () => {
    expect(tokenMissingRate({ totalTurns: 10, missingTurns: 10 })).toBeCloseTo(1);
  });
});

describe('applyTokenFactor', () => {
  it('value * factor', () => {
    expect(applyTokenFactor(100, 1.25)).toBeCloseTo(125);
  });

  it('factor=1 は値をそのまま返す', () => {
    expect(applyTokenFactor(200, 1)).toBe(200);
  });
});
