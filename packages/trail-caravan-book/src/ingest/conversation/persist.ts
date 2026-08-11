import { createHash } from 'node:crypto';
import type { CaravanDbConnection } from '../../db/connection/types';
import { canonicalize } from '../../canonical/canonicalize';
import { entityId } from '../../canonical/entityId';
import type { Episode } from '../../canonical/splitEpisodes';
import { isLowInformationEntity } from '../../canonical/entityQuality';
import type { ExtractionResult } from './extractFacts';
import { applySingleActiveRule } from '../../invalidate/ruleBased';
import type { CaravanLogger } from '../../logger';

export interface PersistStats {
  entities_inserted: number;
  entities_updated: number;
  entities_suppressed: number;
  edges_inserted: number;
  edges_invalidated: number;
  edges_suppressed: number;
}

/**
 * 取込時点のエンティティは summary を持たない（summary は後付け）ため、
 * entityQuality の summary レスキューは常に発動させず名前だけで判定する。
 */
function isSuppressedName(name: string): boolean {
  return isLowInformationEntity(name, '');
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

export function episodeId(sessionId: string, messageUuidStart: string): string {
  return createHash('sha1')
    .update(`${sessionId}:${messageUuidStart}`)
    .digest('hex')
    .slice(0, 16);
}

/** 永続化 5 段が共有する入力。`epId` は episode の派生キー。 */
interface PersistContext {
  db: CaravanDbConnection;
  episode: Episode;
  recordedAt: string;
  logger: CaravanLogger;
  epId: string;
}

/** ── 1. Upsert caravan_episodes ─────────────────────────────────────────── */
function upsertEpisodeRow(ctx: PersistContext, summary: string): void {
  ctx.db.run(
    `INSERT INTO caravan_episodes
       (id, session_id, message_uuid_start, message_uuid_end,
        agent_runtime, model, valid_from, recorded_at, raw_excerpt, summary)
     VALUES (?, ?, ?, ?, 'claude_code', 'unknown', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       message_uuid_end = excluded.message_uuid_end,
       raw_excerpt      = excluded.raw_excerpt,
       -- 空要約（LLM が summary を省略した再 ingest 等）で既存の要約を破壊しない。
       -- 非空のときのみ上書きする。
       summary          = CASE WHEN excluded.summary != '' THEN excluded.summary
                               ELSE caravan_episodes.summary END`,
    [
      ctx.epId,
      ctx.episode.session_id,
      ctx.episode.message_uuid_start,
      ctx.episode.message_uuid_end,
      ctx.episode.valid_from,
      ctx.recordedAt,
      ctx.episode.raw_excerpt,
      summary,
    ]
  );
}

/**
 * ── 2. Upsert entities ────────────────────────────────────────────────────
 * canonical_name → entity id の対応（キーは "type:canonicalName"）を返す。
 * エッジ構築とセクション 4 がこの map を使う。
 */
function upsertExtractedEntities(
  ctx: PersistContext,
  entities: ExtractionResult['entities'],
  stats: PersistStats,
): Map<string, string> {
  const entityIdMap = new Map<string, string>();

  for (const ent of entities) {
    if (isSuppressedName(ent.name)) {
      stats.entities_suppressed += 1;
      continue;
    }
    const canonName = canonicalize(ent.name);
    const eId = entityId(ent.type, canonName);
    entityIdMap.set(`${ent.type}:${canonName}`, eId);

    // Detect whether the row exists before upsert to track inserted vs updated
    const existsStmt = ctx.db.prepare(
      `SELECT id FROM caravan_entities WHERE type = ? AND canonical_name = ?`
    );
    const exists = existsStmt.get(ent.type, canonName) !== undefined;
    existsStmt.free?.();

    try {
      ctx.db.run(
        `INSERT INTO caravan_entities
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
          JSON.stringify(ent.aliases ?? []),
          JSON.stringify(ent.tags ?? []),
          JSON.stringify(ent.attributes ?? {}),
          ctx.recordedAt,
          ctx.recordedAt,
          ctx.recordedAt,
        ]
      );

      if (exists) stats.entities_updated += 1;
      else stats.entities_inserted += 1;
    } catch (err) {
      ctx.logger.error(
        `[anytime-memory] persist: failed to upsert entity type=${ent.type} name=${ent.name}`,
        err
      );
    }
  }

  return entityIdMap;
}

/** モデルが relations で参照したが entities[] に挙げなかった端点を auto-upsert する。 */
function ensureRelationEndpoints(
  ctx: PersistContext,
  endpoints: ReadonlyArray<{ mapKey: string; endpoint: { type: string; name: string } }>,
  entityIdMap: Map<string, string>,
): void {
  for (const { mapKey, endpoint } of endpoints) {
    if (entityIdMap.get(mapKey) !== undefined) continue;
    const canon = canonicalize(endpoint.name);
    const eId = entityId(endpoint.type, canon);
    try {
      ctx.db.run(
        `INSERT INTO caravan_entities
           (id, type, canonical_name, display_name,
            aliases_json, tags_json, attributes_json,
            first_seen_at, last_updated_at, recorded_at)
         VALUES (?, ?, ?, ?, '[]', '[]', '{}', ?, ?, ?)
         ON CONFLICT(type, canonical_name) DO UPDATE SET
           last_updated_at = excluded.last_updated_at`,
        [eId, endpoint.type, canon, endpoint.name, ctx.recordedAt, ctx.recordedAt, ctx.recordedAt],
      );
      entityIdMap.set(mapKey, eId);
    } catch {
      ctx.logger.warn?.(
        `[anytime-memory] persist: failed to auto-upsert endpoint ${mapKey}`,
      );
    }
  }
}

/** relation 1 件をエッジとして永続化する（端点の auto-upsert を含む）。 */
function persistRelation(
  ctx: PersistContext,
  rel: ExtractionResult['relations'][number],
  entityIdMap: Map<string, string>,
  stats: PersistStats,
): void {
  // 端点のどちらかが低情報なら、端点の auto-upsert ごとエッジを捨てる
  // （片端だけ残すとどの実体とも接続しない孤立ノードを生む）。
  if (isSuppressedName(rel.subject.name) || isSuppressedName(rel.object.name)) {
    stats.edges_suppressed += 1;
    return;
  }
  const subjectMapKey = `${rel.subject.type}:${canonicalize(rel.subject.name)}`;
  const objectMapKey = `${rel.object.type}:${canonicalize(rel.object.name)}`;

  ensureRelationEndpoints(
    ctx,
    [
      { mapKey: subjectMapKey, endpoint: rel.subject },
      { mapKey: objectMapKey, endpoint: rel.object },
    ],
    entityIdMap,
  );

  const subjectId = entityIdMap.get(subjectMapKey);
  const objectId = entityIdMap.get(objectMapKey);
  if (subjectId === undefined || objectId === undefined) {
    ctx.logger.warn?.(
      `[anytime-memory] persist: skipping edge "${rel.predicate}" — endpoint upsert failed ` +
        `(subject=${subjectMapKey}, object=${objectMapKey})`,
    );
    return;
  }

  const eId = edgeId(subjectId, rel.predicate, objectId, ctx.episode.message_uuid_start);

  // Insert the new edge first so the FK in caravan_edge_invalidations.superseding_edge_id resolves.
  try {
    ctx.db.run(
      `INSERT INTO caravan_edges
         (id, subject_entity_id, predicate, object_entity_id,
          valid_from, recorded_at, source_type, source_ref,
          confidence, confidence_label, modality)
       VALUES (?, ?, ?, ?, ?, ?, 'conversation', ?, 1.0, 'EXTRACTED', 'asserted')
       ON CONFLICT(id) DO NOTHING`,
      [eId, subjectId, rel.predicate, objectId, ctx.episode.valid_from, ctx.recordedAt, ctx.epId]
    );
    stats.edges_inserted += 1;
  } catch (err) {
    ctx.logger.error(
      `[anytime-memory] persist: failed to insert edge id=${eId} predicate=${rel.predicate}`,
      err
    );
    return;
  }

  // Apply single_active rule after insert so superseding_edge_id FK is satisfied.
  const { invalidated_edge_ids } = applySingleActiveRule(ctx.db, {
    id: eId,
    subject_entity_id: subjectId,
    predicate: rel.predicate,
    object_entity_id: objectId,
    recorded_at: ctx.recordedAt,
  });
  stats.edges_invalidated += invalidated_edge_ids.length;
}

/** ── 4. Insert episode_entities ─────────────────────────────────────────── */
function insertEpisodeEntities(ctx: PersistContext, entityIdMap: ReadonlyMap<string, string>): void {
  for (const [mapKey, eId] of entityIdMap) {
    try {
      ctx.db.run(
        `INSERT INTO caravan_episode_entities (episode_id, entity_id, mention_text)
         VALUES (?, ?, '')
         ON CONFLICT(episode_id, entity_id) DO NOTHING`,
        [ctx.epId, eId]
      );
    } catch (err) {
      ctx.logger.error(
        `[anytime-memory] persist: failed to insert episode_entity epId=${ctx.epId} entityId=${eId} mapKey=${mapKey}`,
        err
      );
    }
  }
}

/**
 * ── 5. Handle questions ───────────────────────────────────────────────────
 * Question エンティティと asked_by エッジを張る。
 *
 * answered_in エッジは書かない。取込対象が人間の発言だけになり、回答が episode
 * 内に存在しなくなったため、この述語は構造上ぜったいに真にならない（2026-08-06）。
 */
function persistQuestion(
  ctx: PersistContext,
  text: string,
  entityIdMap: Map<string, string>,
  stats: PersistStats,
): void {
  if (isSuppressedName(text)) {
    stats.entities_suppressed += 1;
    return;
  }
  const qCanon = canonicalize(text);
  const qId = entityId('Question', qCanon);
  entityIdMap.set(`Question:${qCanon}`, qId);

  try {
    ctx.db.run(
      `INSERT INTO caravan_entities
         (id, type, canonical_name, display_name,
          aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Question', ?, ?, '[]', '[]', '{}', ?, ?, ?)
       ON CONFLICT(type, canonical_name) DO UPDATE SET
         last_updated_at = excluded.last_updated_at`,
      [qId, qCanon, text, ctx.recordedAt, ctx.recordedAt, ctx.recordedAt]
    );
  } catch (err) {
    ctx.logger.error(`[anytime-memory] persist: failed to upsert Question entity text="${text}"`, err);
    return;
  }

  // episode_entities for question entity
  try {
    ctx.db.run(
      `INSERT INTO caravan_episode_entities (episode_id, entity_id, mention_text)
       VALUES (?, ?, '')
       ON CONFLICT(episode_id, entity_id) DO NOTHING`,
      [ctx.epId, qId]
    );
  } catch (err) {
    ctx.logger.error(`[anytime-memory] persist: failed episode_entity for question entity qId=${qId}`, err);
  }

  const sessionId = ctx.episode.session_id;

  // asked_by edge: Question → session_id (object_literal)
  const askedById = edgeId(qId, 'asked_by', sessionId, ctx.episode.message_uuid_start);
  try {
    ctx.db.run(
      `INSERT INTO caravan_edges
         (id, subject_entity_id, predicate, object_literal,
          valid_from, recorded_at, source_type, source_ref,
          confidence, confidence_label, modality)
       VALUES (?, ?, 'asked_by', ?, ?, ?, 'conversation', ?, 1.0, 'EXTRACTED', 'asserted')
       ON CONFLICT(id) DO NOTHING`,
      [askedById, qId, sessionId, ctx.episode.valid_from, ctx.recordedAt, ctx.epId]
    );
    stats.edges_inserted += 1;
  } catch (err) {
    ctx.logger.error(`[anytime-memory] persist: failed to insert asked_by edge for question qId=${qId}`, err);
  }
  const { invalidated_edge_ids: invAsked } = applySingleActiveRule(ctx.db, {
    id: askedById, subject_entity_id: qId, predicate: 'asked_by',
    object_literal: sessionId, recorded_at: ctx.recordedAt,
  });
  stats.edges_invalidated += invAsked.length;
}

/**
 * Persists a single episode's extracted facts into the caravan-book DB.
 * Returns counts of rows affected.
 */
export function persistEpisodeFacts(opts: {
  db: CaravanDbConnection;
  episode: Episode;
  extracted: ExtractionResult;
  recordedAt: string;
  logger: CaravanLogger;
}): PersistStats {
  const { db, episode, extracted, recordedAt, logger } = opts;
  const stats: PersistStats = {
    entities_inserted: 0,
    entities_updated: 0,
    entities_suppressed: 0,
    edges_inserted: 0,
    edges_invalidated: 0,
    edges_suppressed: 0,
  };

  const ctx: PersistContext = {
    db,
    episode,
    recordedAt,
    logger,
    epId: episodeId(episode.session_id, episode.message_uuid_start),
  };

  upsertEpisodeRow(ctx, extracted.summary ?? '');
  const entityIdMap = upsertExtractedEntities(ctx, extracted.entities, stats);
  for (const rel of extracted.relations) {
    persistRelation(ctx, rel, entityIdMap, stats);
  }
  insertEpisodeEntities(ctx, entityIdMap);
  for (const q of extracted.questions ?? []) {
    persistQuestion(ctx, q.text, entityIdMap, stats);
  }

  return stats;
}
