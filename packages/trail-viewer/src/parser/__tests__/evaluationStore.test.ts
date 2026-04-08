import type { TrailEvaluation } from '../types';
import { createEvaluation, isValidEvaluation } from '../evaluationStore';

describe('createEvaluation', () => {
  it('creates a valid evaluation with correct fields', () => {
    const before = Date.now();
    const result = createEvaluation('session-1', 3, 'Good session', 'alice');
    const after = Date.now();

    expect(result.sessionId).toBe('session-1');
    expect(result.score).toBe(3);
    expect(result.comment).toBe('Good session');
    expect(result.evaluator).toBe('alice');
    expect(result.id).toMatch(/^eval-session-1-\d+-\d+$/);

    const createdAtMs = new Date(result.createdAt).getTime();
    expect(createdAtMs).toBeGreaterThanOrEqual(before);
    expect(createdAtMs).toBeLessThanOrEqual(after);
  });

  it('accepts score of 1 (minimum)', () => {
    const result = createEvaluation('s1', 1, '', 'bob');
    expect(result.score).toBe(1);
  });

  it('accepts score of 5 (maximum)', () => {
    const result = createEvaluation('s1', 5, '', 'bob');
    expect(result.score).toBe(5);
  });

  it('throws RangeError for score below 1', () => {
    expect(() => createEvaluation('s1', 0, '', 'bob')).toThrow(RangeError);
    expect(() => createEvaluation('s1', -1, '', 'bob')).toThrow(RangeError);
  });

  it('throws RangeError for score above 5', () => {
    expect(() => createEvaluation('s1', 6, '', 'bob')).toThrow(RangeError);
    expect(() => createEvaluation('s1', 100, '', 'bob')).toThrow(RangeError);
  });

  it('throws RangeError for non-integer score', () => {
    expect(() => createEvaluation('s1', 2.5, '', 'bob')).toThrow(RangeError);
    expect(() => createEvaluation('s1', 1.1, '', 'bob')).toThrow(RangeError);
  });

  it('generates unique IDs for different calls', () => {
    const a = createEvaluation('s1', 3, '', 'bob');
    const b = createEvaluation('s1', 3, '', 'bob');
    expect(a.id).not.toBe(b.id);
  });
});

describe('isValidEvaluation', () => {
  const validEval: TrailEvaluation = {
    id: 'eval-s1-1000',
    sessionId: 's1',
    score: 4,
    comment: 'Nice',
    evaluator: 'alice',
    createdAt: '2026-04-07T00:00:00Z',
  };

  it('returns true for a valid evaluation', () => {
    expect(isValidEvaluation(validEval)).toBe(true);
  });

  it('returns true for edge scores (1 and 5)', () => {
    expect(isValidEvaluation({ ...validEval, score: 1 })).toBe(true);
    expect(isValidEvaluation({ ...validEval, score: 5 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidEvaluation(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidEvaluation(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isValidEvaluation('string')).toBe(false);
    expect(isValidEvaluation(42)).toBe(false);
  });

  it('returns false when id is missing', () => {
    const { id: _, ...rest } = validEval;
    expect(isValidEvaluation(rest)).toBe(false);
  });

  it('returns false when score is out of range', () => {
    expect(isValidEvaluation({ ...validEval, score: 0 })).toBe(false);
    expect(isValidEvaluation({ ...validEval, score: 6 })).toBe(false);
  });

  it('returns false when score is not a number', () => {
    expect(isValidEvaluation({ ...validEval, score: '4' })).toBe(false);
  });

  it('returns false when required string fields are wrong type', () => {
    expect(isValidEvaluation({ ...validEval, comment: 123 })).toBe(false);
    expect(isValidEvaluation({ ...validEval, evaluator: null })).toBe(false);
    expect(isValidEvaluation({ ...validEval, createdAt: 0 })).toBe(false);
  });
});
