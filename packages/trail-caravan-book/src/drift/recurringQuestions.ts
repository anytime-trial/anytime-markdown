import type { CaravanDbConnection, SqlValue } from '../db/connection/types';
import { toUint8ArrayOrNull } from '../db/connection/blobUtil';
import type { CaravanLogger } from '../logger';
import type { DriftEventInput } from './report';
import { THRESHOLDS } from './policy';

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function blobToFloat32Array(blob: ArrayBuffer | Uint8Array | null): Float32Array | null {
  if (!blob) return null;
  const buf = blob instanceof Uint8Array ? blob.buffer : blob;
  return new Float32Array(buf);
}

type QuestionRow = {
  id: string;
  attributes_json: string;
  embedding: Uint8Array | null;
};

type QuestionWithEmbedding = QuestionRow & {
  targetSpecPath: string | null;
  embedding32: Float32Array;
};

/**
 * caravan_entities の 1 行を Question として解釈する。
 * 対象が特定できない行（§6.4.3）と埋め込みが読めない行は null で落とす。
 */
function toQuestionWithEmbedding(row: ReadonlyArray<SqlValue>): QuestionWithEmbedding | null {
  const id = row[0] as string;
  const attrsJson = row[1] as string;
  const embeddingRaw = toUint8ArrayOrNull(row[2]);

  let attrs: Record<string, unknown> = {};
  try {
    attrs = JSON.parse(attrsJson);
  } catch {
    // malformed json — skip
  }

  const targetSpecPath = (attrs['target_spec_path'] as string | undefined) ?? null;
  const targetSymbol = (attrs['target_symbol'] as string | undefined) ?? null;

  // §6.4.3: target_spec_path IS NULL AND target_symbol IS NULL はスキップ
  if (targetSpecPath === null && targetSymbol === null) return null;

  const embedding32 = blobToFloat32Array(embeddingRaw);
  if (!embedding32) return null;

  return { id, attributes_json: attrsJson, embedding: embeddingRaw, targetSpecPath, embedding32 };
}

/** target_spec_path でグルーピングする（null の場合は target_symbol で代替）。 */
function groupQuestions(
  questions: QuestionWithEmbedding[],
): Map<string, QuestionWithEmbedding[]> {
  const groups = new Map<string, QuestionWithEmbedding[]>();
  for (const q of questions) {
    const key = q.targetSpecPath ?? `symbol:${JSON.parse(q.attributes_json)['target_symbol']}`;
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [q]);
    } else {
      bucket.push(q);
    }
  }
  return groups;
}

function buildRecurringQuestionEvent(
  groupKey: string,
  qs: QuestionWithEmbedding[],
  minCount: number,
  cosineThreshold: number,
): DriftEventInput | null {
  if (qs.length < minCount) return null;

  const pairs: Array<{ a: string; b: string; cosine: number }> = [];
  for (let i = 0; i < qs.length; i++) {
    for (let j = i + 1; j < qs.length; j++) {
      const cosine = cosineSimilarity(qs[i].embedding32, qs[j].embedding32);
      if (cosine >= cosineThreshold) {
        pairs.push({ a: qs[i].id, b: qs[j].id, cosine });
      }
    }
  }

  if (pairs.length === 0) return null;

  return {
    subject_entity_id: `spec_clarification:${groupKey}`,
    predicate: 'recurring_question',
    conversation_value: null,
    spec_value: null,
    code_value: null,
    drift_type: 'spec_clarification_recurring',
    severity: 'warn',
    // Question entity は repo_name を持たない（実測 2026-08-05: caravan_entities.repo_name は
    // 97,340 件が NULL）。推測で埋めず未解決のままにする。
    workspace: '',
    detail: {
      target_spec_path: qs[0].targetSpecPath,
      group_key: groupKey,
      question_ids: qs.map((q) => q.id),
      pairs,
    },
  };
}

export function detectRecurringQuestions(input: {
  db: CaravanDbConnection;
  windowDays?: number;
  minCount?: number;
  cosineThreshold?: number;
  logger: CaravanLogger;
}): DriftEventInput[] {
  const {
    db,
    windowDays = THRESHOLDS.f22WindowDays,
    minCount = THRESHOLDS.f22MinCount,
    cosineThreshold = THRESHOLDS.f22CosineThreshold,
    logger,
  } = input;

  let rows: ReturnType<CaravanDbConnection['exec']>;
  try {
    rows = db.exec(
      `SELECT id, attributes_json, embedding
       FROM caravan_entities
       WHERE type = 'Question'
         AND embedding IS NOT NULL
         AND last_updated_at >= datetime('now', '-' || ? || ' days')`,
      [windowDays],
    );
  } catch (err) {
    logger.error(
      `[detectRecurringQuestions] SQL failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  const questions: QuestionWithEmbedding[] = [];

  for (const row of rows[0]?.values ?? []) {
    const question = toQuestionWithEmbedding(row);
    if (question !== null) questions.push(question);
  }

  const groups = groupQuestions(questions);

  const results: DriftEventInput[] = [];

  for (const [groupKey, qs] of groups) {
    const event = buildRecurringQuestionEvent(groupKey, qs, minCount, cosineThreshold);
    if (event !== null) results.push(event);
  }

  return results;
}
