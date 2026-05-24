import { shouldDeferPeriodicRun } from '../AnalyzeAllRunner';

describe('shouldDeferPeriodicRun', () => {
  it('defers a periodic run when the gate says COOLING', () => {
    expect(shouldDeferPeriodicRun('periodic', () => true)).toBe(true);
  });

  it('does not defer a periodic run when the gate is NORMAL', () => {
    expect(shouldDeferPeriodicRun('periodic', () => false)).toBe(false);
  });

  it('never defers non-periodic runs (manual / import / startup)', () => {
    expect(shouldDeferPeriodicRun('manual', () => true)).toBe(false);
    expect(shouldDeferPeriodicRun('import', () => true)).toBe(false);
    expect(shouldDeferPeriodicRun('startup', () => true)).toBe(false);
  });

  it('does not defer when no gate is configured', () => {
    expect(shouldDeferPeriodicRun('periodic', undefined)).toBe(false);
  });
});
