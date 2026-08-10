import type { CaravanDbConnection, SqlValue } from '../db/connection/types';
import { canonicalize } from '../canonical/canonicalize';
import type { CaravanLogger } from '../logger';
import { CODE_STRUCTURAL_PREDICATES } from './policy';
export type { DriftType } from './policy';

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

function resolveDriftType(
  convSpecDiff: boolean,
  specCodeDiff: boolean,
  convCodeDiff: boolean,
): DriftCandidate['drift_type'] {
  if (convSpecDiff && specCodeDiff && convCodeDiff) return 'three_way';
  if (specCodeDiff) return 'spec_vs_code';
  if (convCodeDiff) return 'conv_vs_code';
  return 'conv_vs_spec';
}

/**
 * 集約結果の 1 行を DriftCandidate へ変換する。正規化後に全ソースが一致した
 * 行は drift ではないので null を返す（SQL は生値で比較しているため、
 * normalizeValue が差分を解消することがある）。
 */
function toDriftCandidate(
  row: ReadonlyArray<SqlValue>,
  colIndex: (name: string) => number,
): DriftCandidate | null {
  const subject_entity_id = row[colIndex('subject_entity_id')] as string;
  const predicate = row[colIndex('predicate')] as string;
  const rawConv = row[colIndex('conv_v')] as string | null;
  const rawSpec = row[colIndex('spec_v')] as string | null;
  const rawCode = row[colIndex('code_v')] as string | null;

  // Normalize for comparison
  const convN = rawConv === null ? null : normalizeValue(rawConv);
  const specN = rawSpec === null ? null : normalizeValue(rawSpec);
  const codeN = rawCode === null ? null : normalizeValue(rawCode);

  // Check disagreements using normalized values
  const convSpecDiff = convN !== null && specN !== null && convN !== specN;
  const specCodeDiff = specN !== null && codeN !== null && specN !== codeN;
  const convCodeDiff = convN !== null && codeN !== null && convN !== codeN;

  // Skip if normalization made all sources equal (SQL compared raw; normalization may reconcile)
  if (!convSpecDiff && !specCodeDiff && !convCodeDiff) {
    return null;
  }

  // Determine drift_type (three_way takes priority)
  const drift_type = resolveDriftType(convSpecDiff, specCodeDiff, convCodeDiff);

  return {
    subject_entity_id,
    predicate,
    conversation_value: rawConv,
    spec_value: rawSpec,
    code_value: rawCode,
    drift_type,
  };
}

/**
 * Detects drift candidates by comparing caravan_edges across
 * 'conversation', 'spec', and 'code' source types.
 *
 * Returns edges where at least two sources disagree after normalization.
 */
export function detectThreeSourceDrifts(input: {
  db: CaravanDbConnection;
  minConfidence?: number;
  excludePredicates?: string[];
  logger: CaravanLogger;
}): DriftCandidate[] {
  const {
    db,
    minConfidence = 0.6,
    excludePredicates = [...CODE_STRUCTURAL_PREDICATES],
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
      placeholders === null ? '' : `AND predicate NOT IN (${placeholders})`;

    const sql = `
      SELECT
        subject_entity_id,
        predicate,
        MAX(CASE WHEN source_type = 'conversation' THEN COALESCE(object_literal, object_entity_id) END) AS conv_v,
        MAX(CASE WHEN source_type = 'spec'         THEN COALESCE(object_literal, object_entity_id) END) AS spec_v,
        MAX(CASE WHEN source_type = 'code'         THEN COALESCE(object_literal, object_entity_id) END) AS code_v
      FROM caravan_edges
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
      const candidate = toDriftCandidate(row, colIndex);
      if (candidate !== null) {
        candidates.push(candidate);
      }
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
