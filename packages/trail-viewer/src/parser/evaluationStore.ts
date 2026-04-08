import type { TrailEvaluation } from './types';

let evalCounter = 0;

/**
 * Create a new evaluation. Pure function — storage is handled by server/API.
 */
export function createEvaluation(
  sessionId: string,
  score: number,
  comment: string,
  evaluator: string,
): TrailEvaluation {
  if (score < 1 || score > 5 || !Number.isInteger(score)) {
    throw new RangeError('Score must be an integer between 1 and 5');
  }
  return {
    id: `eval-${sessionId}-${Date.now()}-${evalCounter++}`,
    sessionId,
    score,
    comment,
    evaluator,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Validate an evaluation object.
 */
export function isValidEvaluation(eval_: unknown): eval_ is TrailEvaluation {
  if (typeof eval_ !== 'object' || eval_ === null) return false;
  const e = eval_ as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.sessionId === 'string' &&
    typeof e.score === 'number' &&
    e.score >= 1 &&
    e.score <= 5 &&
    typeof e.comment === 'string' &&
    typeof e.evaluator === 'string' &&
    typeof e.createdAt === 'string'
  );
}
