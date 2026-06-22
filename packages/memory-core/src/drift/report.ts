import type { MemoryDbConnection } from '../db/connection/types';
import type { MemoryLogger } from '../logger';
import type { DriftType, Severity } from './policy';
import { entityId } from '../canonical/entityId';
import { canonicalize } from '../canonical/canonicalize';

export type DriftEventInput = {
  subject_entity_id: string;
  predicate: string;
  conversation_value: string | null;
  spec_value: string | null;
  code_value: string | null;
  drift_type: DriftType;
  severity: Severity;
  detail: Record<string, unknown>;
};

type ReportResult = {
  events_inserted: number;
  events_updated: number;
  events_resolved: number;
};

type ActiveEvent = {
  id: string;
  subject_entity_id: string;
  predicate: string;
  drift_type: string;
};

function driftKey(subjectId: string, predicate: string, driftType: string): string {
  return `${subjectId}:${predicate}:${driftType}`;
}

function eventId(subjectId: string, predicate: string, driftType: string): string {
  return `drift:${subjectId}:${predicate}:${driftType}`;
}

function ensureEntity(
  db: MemoryDbConnection,
  id: string,
  type: string,
  canonicalName: string,
  displayName: string,
  recordedAt: string,
): void {
  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
    [id, type, canonicalName, displayName, recordedAt, recordedAt, recordedAt],
  );
}

/**
 * drift candidate の subject_entity_id を **正準 entity id** へ解決し、FK を満たすため
 * 対応する memory_entities 行を冪等に確保して、解決後の id を返す。
 *
 * 一部の検出器は `file:<path>` / `package:<name>` / `spec_clarification:<key>` 等の合成 ID を
 * subject にする。memory_drift_events.subject_entity_id は memory_entities(id) への FK を持つため、
 * これを実 entity に写像しないと FK 違反で INSERT が silent に欠落していた（regression_cluster 等が
 * 常に 0 件だった真因）。さらに memory_entities は UNIQUE(type, canonical_name) を持つので、合成 ID を
 * 生パスのまま canonical_name にすると既存の実 File entity（canonical_name=canonicalize(path)）と衝突し、
 * INSERT OR IGNORE が黙ってスキップして FK 違反が再発する。
 *
 * 対策:
 * - `file:`/`package:` は ingest 側と同じ `entityId(type, canonicalize(name))` で正準 id を算出し、
 *   既存の実 File/Package entity に**連結**する（無ければ正準スキームで作成）。
 * - `spec_clarification:` は対応する実 entity が無いので、接頭辞付き id をそのまま Question entity として
 *   確保する（canonical_name も接頭辞付きで実 Question と衝突しない）。
 * - 接頭辞無し（recurring_root_cause 等の実 entity id）はそのまま返す（既存なら no-op）。
 */
function resolveSubjectEntity(db: MemoryDbConnection, subjectId: string, recordedAt: string): string {
  if (subjectId.startsWith('file:')) {
    const path = subjectId.slice('file:'.length);
    const canon = canonicalize(path);
    const id = entityId('File', canon);
    ensureEntity(db, id, 'File', canon, path, recordedAt);
    return id;
  }
  if (subjectId.startsWith('package:')) {
    const pkg = subjectId.slice('package:'.length);
    const canon = canonicalize(pkg);
    const id = entityId('Package', canon);
    ensureEntity(db, id, 'Package', canon, pkg, recordedAt);
    return id;
  }
  if (subjectId.startsWith('spec_clarification:')) {
    ensureEntity(db, subjectId, 'Question', subjectId, subjectId.slice('spec_clarification:'.length), recordedAt);
    return subjectId;
  }
  // 接頭辞無し = 実 entity id（既存なら no-op。念のため不在時は Concept stub で FK を満たす）。
  ensureEntity(db, subjectId, 'Concept', subjectId, subjectId, recordedAt);
  return subjectId;
}

export function reportDriftEvents(input: {
  db: MemoryDbConnection;
  candidates: DriftEventInput[];
  recordedAt: string;
  autoResolveStale?: boolean;
  logger: MemoryLogger;
}): ReportResult {
  const { db, candidates, recordedAt, autoResolveStale = true, logger } = input;

  const result: ReportResult = { events_inserted: 0, events_updated: 0, events_resolved: 0 };

  // 0. subject_entity_id を正準 entity id へ正規化し、FK 用に entity を確保する。
  //    以降の key 計算・突合・INSERT はすべて正規化後の id で行う。
  const normalizedCandidates = candidates.map((c) => ({
    ...c,
    subject_entity_id: resolveSubjectEntity(db, c.subject_entity_id, recordedAt),
  }));

  // 1. 既存の active drift events を取得
  const rows = db.exec(
    'SELECT id, subject_entity_id, predicate, drift_type FROM memory_drift_events WHERE resolved_at IS NULL',
  );
  const activeEvents: ActiveEvent[] = (rows[0]?.values ?? []).map((r) => ({
    id: r[0] as string,
    subject_entity_id: r[1] as string,
    predicate: r[2] as string,
    drift_type: r[3] as string,
  }));

  // 2. 候補を Set 化
  const candidateKeys = new Set(
    normalizedCandidates.map((c) => driftKey(c.subject_entity_id, c.predicate, c.drift_type)),
  );

  // 3. auto-resolve: 候補に含まれなくなった既存 event
  if (autoResolveStale) {
    for (const ev of activeEvents) {
      const key = driftKey(ev.subject_entity_id, ev.predicate, ev.drift_type);
      if (!candidateKeys.has(key)) {
        try {
          db.run(
            `UPDATE memory_drift_events
             SET resolved_at = ?, resolution_note = 'auto: drift no longer present'
             WHERE id = ?`,
            [recordedAt, ev.id],
          );
          result.events_resolved++;
        } catch (err) {
          logger.error(`[reportDriftEvents] auto-resolve failed id=${ev.id}: ${String(err)}`);
        }
      }
    }
  }

  // 4. 候補を upsert（SELECT → UPDATE or INSERT）
  const activeByKey = new Map<string, ActiveEvent>();
  for (const ev of activeEvents) {
    activeByKey.set(driftKey(ev.subject_entity_id, ev.predicate, ev.drift_type), ev);
  }

  for (const candidate of normalizedCandidates) {
    const key = driftKey(candidate.subject_entity_id, candidate.predicate, candidate.drift_type);
    const existing = activeByKey.get(key);
    const detailJson = JSON.stringify({ ...candidate.detail, policy_version: 'phase4-v1' });

    if (existing) {
      // severity と detail_json のみ更新（detected_at は変えない）
      try {
        db.run(
          `UPDATE memory_drift_events SET severity = ?, detail_json = ? WHERE id = ?`,
          [candidate.severity, detailJson, existing.id],
        );
        result.events_updated++;
      } catch (err) {
        logger.error(`[reportDriftEvents] update failed id=${existing.id}: ${String(err)}`);
      }
    } else {
      // 新規 INSERT（resolved の行があっても新規行として追加）。
      // subject entity は step 0 で正規化・確保済みなので FK は満たされる。
      try {
        db.run(
          `INSERT INTO memory_drift_events
             (id, subject_entity_id, predicate, conversation_value, spec_value, code_value,
              drift_type, severity, detected_at, detail_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eventId(candidate.subject_entity_id, candidate.predicate, candidate.drift_type),
            candidate.subject_entity_id,
            candidate.predicate,
            candidate.conversation_value ?? null,
            candidate.spec_value ?? null,
            candidate.code_value ?? null,
            candidate.drift_type,
            candidate.severity,
            recordedAt,
            detailJson,
          ],
        );
        result.events_inserted++;
      } catch (err) {
        logger.error(
          `[reportDriftEvents] insert failed ${key}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
        );
      }
    }
  }

  return result;
}
