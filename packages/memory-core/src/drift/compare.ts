import type { Database } from 'sql.js';
import { canonicalize } from '../canonical/canonicalize';
import type { MemoryLogger } from '../logger';
import { DriftType } from './policy';

export type { DriftType };

export type DriftCandidate = {
  subject_entity_id: string;
  predicate: string;
  conversation_value: string | null;
  spec_value: string | null;
  code_value: string | null;
  drift_type: 'spec_vs_code' | 'conv_vs_code' | 'conv_vs_spec' | 'three_way';
};

/**
 * Normalizes a value string for drift comparison.
 * Extends canonicalize() with .js suffix removal (react.js → react, next.js → next).
 */
function normalizeValue(value: string): string {
  return canonicalize(value).replace(/\.js$/, '');
}

/**
 * Detects drift candidates by comparing memory_edges across
 * 'conversation', 'spec', and 'code' source types.
 *
 * Returns edges where at least two sources disagree after normalization.
 */
export function detectThreeSourceDrifts(input: {
  db: Database;
  minConfidence?: number;
  excludePredicates?: string[];
  logger: MemoryLogger;
}): DriftCandidate[] {
  const {
    db,
    minConfidence = 0.6,
    excludePredicates = ['relates_to'],
    logger,
  } = input;

  try {
    // Build dynamic IN clause for excludePredicates.
    // sql.js does not support array binding, so we generate placeholders dynamically.
    const placeholders =
      excludePredicates.length > 0
        ? excludePredicates.map(() => '?').join(', ')
        : null;

    const whereExclude =
      placeholders !== null ? `AND predicate NOT IN (${placeholders})` : '';

    const sql = `
      SELECT
        subject_entity_id,
        predicate,
        MAX(CASE WHEN source_type = 'conversation' THEN COALESCE(object_literal, object_entity_id) END) AS conv_v,
        MAX(CASE WHEN source_type = 'spec'         THEN COALESCE(object_literal, object_entity_id) END) AS spec_v,
        MAX(CASE WHEN source_type = 'code'         THEN COALESCE(object_literal, object_entity_id) END) AS code_v
      FROM memory_edges
      WHERE valid_to IS NULL
        AND confidence >= ?
        ${whereExclude}
      GROUP BY subject_entity_id, predicate
      HAVING
          (conv_v IS NOT NULL AND spec_v IS NOT NULL AND conv_v != spec_v)
       OR (spec_v IS NOT NULL AND code_v IS NOT NULL AND spec_v != code_v)
       OR (conv_v IS NOT NULL AND code_v IS NOT NULL AND conv_v != code_v)
    `;

    const params: (string | number)[] = [minConfidence, ...excludePredicates];

    const result = db.exec(sql, params);

    if (result.length === 0) {
      return [];
    }

    const [{ columns, values }] = result;
    const colIndex = (name: string): number => columns.indexOf(name);

    const candidates: DriftCandidate[] = [];

    for (const row of values) {
      const subject_entity_id = row[colIndex('subject_entity_id')] as string;
      const predicate = row[colIndex('predicate')] as string;
      const rawConv = row[colIndex('conv_v')] as string | null;
      const rawSpec = row[colIndex('spec_v')] as string | null;
      const rawCode = row[colIndex('code_v')] as string | null;

      // Normalize for comparison
      const convN = rawConv !== null ? normalizeValue(rawConv) : null;
      const specN = rawSpec !== null ? normalizeValue(rawSpec) : null;
      const codeN = rawCode !== null ? normalizeValue(rawCode) : null;

      // Check disagreements using normalized values
      const convSpecDiff = convN !== null && specN !== null && convN !== specN;
      const specCodeDiff = specN !== null && codeN !== null && specN !== codeN;
      const convCodeDiff = convN !== null && codeN !== null && convN !== codeN;

      // Skip if normalization made all sources equal (SQL compared raw; normalization may reconcile)
      if (!convSpecDiff && !specCodeDiff && !convCodeDiff) {
        continue;
      }

      // Determine drift_type (three_way takes priority)
      let drift_type: DriftCandidate['drift_type'];
      if (convSpecDiff && specCodeDiff && convCodeDiff) {
        drift_type = 'three_way';
      } else if (specCodeDiff) {
        drift_type = 'spec_vs_code';
      } else if (convCodeDiff) {
        drift_type = 'conv_vs_code';
      } else {
        drift_type = 'conv_vs_spec';
      }

      candidates.push({
        subject_entity_id,
        predicate,
        conversation_value: rawConv,
        spec_value: rawSpec,
        code_value: rawCode,
        drift_type,
      });
    }

    logger.info(
      `[drift/compare] detectThreeSourceDrifts: ${candidates.length} candidate(s) found`,
    );
    return candidates;
  } catch (err) {
    logger.error('[drift/compare] detectThreeSourceDrifts failed', err);
    throw err;
  }
}
