import { createHash } from 'crypto';
import { Database } from 'sql.js';
import { canonicalize } from '../../canonical/canonicalize';
import { entityId } from '../../canonical/entityId';
import type { Episode } from '../../canonical/splitEpisodes';
import type { ExtractionResult } from './extractFacts';
import { applySingleActiveRule } from '../../invalidate/ruleBased';
import type { MemoryLogger } from '../../logger';

export interface PersistStats {
  entities_inserted: number;
  entities_updated: number;
  edges_inserted: number;
  edges_invalidated: number;
}

function edgeId(
  subjectId: string,
  predicate: string,
  objectKey: string,
  episodeUuidStart: string
): string {
  return createHash('sha1')
    .update(`${subjectId}:${predicate}:${objectKey}:${episodeUuidStart}`)
    .digest('hex')
    .slice(0, 16);
}

function episodeId(sessionId: string, messageUuidStart: string): string {
  return createHash('sha1')
    .update(`${sessionId}:${messageUuidStart}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Persists a single episode's extracted facts into the memory DB.
 * Returns counts of rows affected.
 */
export function persistEpisodeFacts(opts: {
  db: Database;
  episode: Episode;
  extracted: ExtractionResult;
  recordedAt: string;
  logger: MemoryLogger;
}): PersistStats {
  const { db, episode, extracted, recordedAt, logger } = opts;
  const stats: PersistStats = {
    entities_inserted: 0,
    entities_updated: 0,
    edges_inserted: 0,
    edges_invalidated: 0,
  };

  const epId = episodeId(episode.session_id, episode.message_uuid_start);

  // ── 1. Upsert memory_episodes ────────────────────────────────────────────
  db.run(
    `INSERT INTO memory_episodes
       (id, session_id, message_uuid_start, message_uuid_end,
        agent_runtime, model, valid_from, recorded_at, raw_excerpt)
     VALUES (?, ?, ?, ?, 'claude_code', 'unknown', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       message_uuid_end = excluded.message_uuid_end,
       raw_excerpt      = excluded.raw_excerpt`,
    [
      epId,
      episode.session_id,
      episode.message_uuid_start,
      episode.message_uuid_end,
      episode.valid_from,
      recordedAt,
      episode.raw_excerpt,
    ]
  );

  // ── 2. Upsert entities ───────────────────────────────────────────────────
  // Map canonical_name → entity id so we can build edges
  const entityIdMap = new Map<string, string>(); // key = "type:canonicalName" → entityId

  for (const ent of extracted.entities) {
    const canonName = canonicalize(ent.name);
    const eId = entityId(ent.type, canonName);
    const mapKey = `${ent.type}:${canonName}`;
    entityIdMap.set(mapKey, eId);

    const aliases = JSON.stringify(ent.aliases ?? []);
    const tags = JSON.stringify(ent.tags ?? []);
    const attributes = JSON.stringify(ent.attributes ?? {});

    // Detect whether the row exists before upsert to track inserted vs updated
    const existsStmt = db.prepare(
      `SELECT id FROM memory_entities WHERE type = ? AND canonical_name = ?`
    );
    existsStmt.bind([ent.type, canonName]);
    const exists = existsStmt.step();
    existsStmt.free();

    try {
      db.run(
        `INSERT INTO memory_entities
           (id, type, canonical_name, display_name,
            aliases_json, tags_json, attributes_json,
            first_seen_at, last_updated_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(type, canonical_name) DO UPDATE SET
           display_name    = excluded.display_name,
           last_updated_at = excluded.last_updated_at`,
        [
          eId,
          ent.type,
          canonName,
          ent.name,
          aliases,
          tags,
          attributes,
          recordedAt,
          recordedAt,
          recordedAt,
        ]
      );

      if (exists) {
        stats.entities_updated += 1;
      } else {
        stats.entities_inserted += 1;
      }
    } catch (err) {
      logger.error(
        `[memory-core] persist: failed to upsert entity type=${ent.type} name=${ent.name}`,
        err
      );
    }
  }

  // ── 3. Insert edges for relations ────────────────────────────────────────
  for (const rel of extracted.relations) {
    const subjectCanon = canonicalize(rel.subject.name);
    const objectCanon = canonicalize(rel.object.name);
    const subjectMapKey = `${rel.subject.type}:${subjectCanon}`;
    const objectMapKey = `${rel.object.type}:${objectCanon}`;

    const subjectId = entityIdMap.get(subjectMapKey);
    const objectId = entityIdMap.get(objectMapKey);

    if (subjectId === undefined || objectId === undefined) {
      // Skip edges whose endpoints were not successfully upserted
      logger.error(
        `[memory-core] persist: skipping edge "${rel.predicate}" — subject or object entity not found ` +
          `(subject=${subjectMapKey}, object=${objectMapKey})`
      );
      continue;
    }

    const eId = edgeId(subjectId, rel.predicate, objectId, episode.message_uuid_start);
    const edgeRecordedAt = recordedAt;

    // Apply single_active rule (invalidates old conflicting edges)
    const { invalidated_edge_ids } = applySingleActiveRule(db, {
      id: eId,
      subject_entity_id: subjectId,
      predicate: rel.predicate,
      object_entity_id: objectId,
      recorded_at: edgeRecordedAt,
    });
    stats.edges_invalidated += invalidated_edge_ids.length;

    try {
      db.run(
        `INSERT INTO memory_edges
           (id, subject_entity_id, predicate, object_entity_id,
            valid_from, recorded_at, source_type, source_ref,
            confidence, confidence_label, modality)
         VALUES (?, ?, ?, ?, ?, ?, 'conversation', ?, 1.0, 'EXTRACTED', 'asserted')
         ON CONFLICT(id) DO NOTHING`,
        [
          eId,
          subjectId,
          rel.predicate,
          objectId,
          episode.valid_from,
          edgeRecordedAt,
          epId,
        ]
      );
      stats.edges_inserted += 1;
    } catch (err) {
      logger.error(
        `[memory-core] persist: failed to insert edge id=${eId} predicate=${rel.predicate}`,
        err
      );
    }
  }

  // ── 4. Insert episode_entities ───────────────────────────────────────────
  for (const [mapKey, eId] of entityIdMap) {
    try {
      db.run(
        `INSERT INTO memory_episode_entities (episode_id, entity_id, mention_text)
         VALUES (?, ?, '')
         ON CONFLICT(episode_id, entity_id) DO NOTHING`,
        [epId, eId]
      );
    } catch (err) {
      logger.error(
        `[memory-core] persist: failed to insert episode_entity epId=${epId} entityId=${eId} mapKey=${mapKey}`,
        err
      );
    }
  }

  // ── 5. Handle questions ──────────────────────────────────────────────────
  for (const q of extracted.questions ?? []) {
    const qCanon = canonicalize(q.text);
    const qId = entityId('Question', qCanon);
    const qMapKey = `Question:${qCanon}`;
    entityIdMap.set(qMapKey, qId);

    try {
      db.run(
        `INSERT INTO memory_entities
           (id, type, canonical_name, display_name,
            aliases_json, tags_json, attributes_json,
            first_seen_at, last_updated_at, recorded_at)
         VALUES (?, 'Question', ?, ?, '[]', '[]', '{}', ?, ?, ?)
         ON CONFLICT(type, canonical_name) DO UPDATE SET
           last_updated_at = excluded.last_updated_at`,
        [qId, qCanon, q.text, recordedAt, recordedAt, recordedAt]
      );
    } catch (err) {
      logger.error(
        `[memory-core] persist: failed to upsert Question entity text="${q.text}"`,
        err
      );
      continue;
    }

    // episode_entities for question entity
    try {
      db.run(
        `INSERT INTO memory_episode_entities (episode_id, entity_id, mention_text)
         VALUES (?, ?, '')
         ON CONFLICT(episode_id, entity_id) DO NOTHING`,
        [epId, qId]
      );
    } catch (err) {
      logger.error(
        `[memory-core] persist: failed episode_entity for question entity qId=${qId}`,
        err
      );
    }

    // asked_by edge: Question → session_id (object_literal)
    const askedById = edgeId(qId, 'asked_by', episode.session_id, episode.message_uuid_start);
    const { invalidated_edge_ids: invAsked } = applySingleActiveRule(db, {
      id: askedById,
      subject_entity_id: qId,
      predicate: 'asked_by',
      object_literal: episode.session_id,
      recorded_at: recordedAt,
    });
    stats.edges_invalidated += invAsked.length;

    try {
      db.run(
        `INSERT INTO memory_edges
           (id, subject_entity_id, predicate, object_literal,
            valid_from, recorded_at, source_type, source_ref,
            confidence, confidence_label, modality)
         VALUES (?, ?, 'asked_by', ?, ?, ?, 'conversation', ?, 1.0, 'EXTRACTED', 'asserted')
         ON CONFLICT(id) DO NOTHING`,
        [askedById, qId, episode.session_id, episode.valid_from, recordedAt, epId]
      );
      stats.edges_inserted += 1;
    } catch (err) {
      logger.error(
        `[memory-core] persist: failed to insert asked_by edge for question qId=${qId}`,
        err
      );
    }

    // answered_in edge: Question → session_id (object_literal)
    const answeredInId = edgeId(
      qId,
      'answered_in',
      episode.session_id,
      episode.message_uuid_start
    );
    // answered_in is multiple_active — no invalidation needed, but run rule anyway
    applySingleActiveRule(db, {
      id: answeredInId,
      subject_entity_id: qId,
      predicate: 'answered_in',
      object_literal: episode.session_id,
      recorded_at: recordedAt,
    });

    try {
      db.run(
        `INSERT INTO memory_edges
           (id, subject_entity_id, predicate, object_literal,
            valid_from, recorded_at, source_type, source_ref,
            confidence, confidence_label, modality)
         VALUES (?, ?, 'answered_in', ?, ?, ?, 'conversation', ?, 1.0, 'EXTRACTED', 'asserted')
         ON CONFLICT(id) DO NOTHING`,
        [answeredInId, qId, episode.session_id, episode.valid_from, recordedAt, epId]
      );
      stats.edges_inserted += 1;
    } catch (err) {
      logger.error(
        `[memory-core] persist: failed to insert answered_in edge for question qId=${qId}`,
        err
      );
    }
  }

  return stats;
}
