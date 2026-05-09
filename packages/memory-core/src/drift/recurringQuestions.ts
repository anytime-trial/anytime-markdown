import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';
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

export function detectRecurringQuestions(input: {
  db: Database;
  windowDays?: number;
  minCount?: number;
  cosineThreshold?: number;
  logger: MemoryLogger;
}): DriftEventInput[] {
  const {
    db,
    windowDays = THRESHOLDS.f22WindowDays,
    minCount = THRESHOLDS.f22MinCount,
    cosineThreshold = THRESHOLDS.f22CosineThreshold,
    logger,
  } = input;

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT id, attributes_json, embedding
       FROM memory_entities
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

  const questions: (QuestionRow & { targetSpecPath: string | null; embedding32: Float32Array })[] =
    [];

  for (const row of rows[0]?.values ?? []) {
    const id = row[0] as string;
    const attrsJson = row[1] as string;
    const embeddingRaw = row[2] as Uint8Array | null;

    let attrs: Record<string, unknown> = {};
    try {
      attrs = JSON.parse(attrsJson);
    } catch {
      // malformed json — skip
    }

    const targetSpecPath = (attrs['target_spec_path'] as string | undefined) ?? null;
    const targetSymbol = (attrs['target_symbol'] as string | undefined) ?? null;

    // §6.4.3: target_spec_path IS NULL AND target_symbol IS NULL はスキップ
    if (targetSpecPath === null && targetSymbol === null) continue;

    const embedding32 = blobToFloat32Array(embeddingRaw);
    if (!embedding32) continue;

    questions.push({ id, attributes_json: attrsJson, embedding: embeddingRaw, targetSpecPath, embedding32 });
  }

  // target_spec_path でグルーピング（null の場合は target_symbol で代替）
  const groups = new Map<string, typeof questions>();
  for (const q of questions) {
    const key = q.targetSpecPath ?? `symbol:${JSON.parse(q.attributes_json)['target_symbol']}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(q);
  }

  const results: DriftEventInput[] = [];

  for (const [groupKey, qs] of groups) {
    if (qs.length < minCount) continue;

    // 総当たりでペアを確認
    const pairs: Array<{ a: string; b: string; cosine: number }> = [];
    let hasSimilarPair = false;

    for (let i = 0; i < qs.length; i++) {
      for (let j = i + 1; j < qs.length; j++) {
        const cosine = cosineSimilarity(qs[i].embedding32, qs[j].embedding32);
        if (cosine >= cosineThreshold) {
          pairs.push({ a: qs[i].id, b: qs[j].id, cosine });
          hasSimilarPair = true;
        }
      }
    }

    if (!hasSimilarPair) continue;

    const targetSpecPath = qs[0].targetSpecPath;
    const subjectId = `spec_clarification:${groupKey}`;

    results.push({
      subject_entity_id: subjectId,
      predicate: 'recurring_question',
      conversation_value: null,
      spec_value: null,
      code_value: null,
      drift_type: 'spec_clarification_recurring',
      severity: 'warn',
      detail: {
        target_spec_path: targetSpecPath,
        group_key: groupKey,
        question_ids: qs.map((q) => q.id),
        pairs,
      },
    });
  }

  return results;
}
