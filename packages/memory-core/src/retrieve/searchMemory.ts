import { Database } from 'sql.js';
import { decodeEmbedding } from '../embedding/codec';
import { cosineSimilarity } from '../embedding/cosine';
import type { OllamaClient } from '../ollama/client';

export interface SearchInput {
  query: string;
  entity_types?: string[];
  source_type?: string;
  since?: string;    // ISO 8601, filter by last_updated_at
  limit?: number;    // default 20
  hops?: number;     // 0 or 1, default 1
}

export interface SearchEntity {
  id: string;
  type: string;
  display_name: string;
  summary: string;
  score: number;
}

export interface SearchEdge {
  id: string;
  subject_id: string;
  predicate: string;
  object_id: string | null;
  object_literal: string | null;
  source_type: string;
  valid_from: string;
  source_ref: string;
  confidence_label: string;
}

export interface SearchEpisode {
  id: string;
  session_id: string;
  valid_from: string;
  raw_excerpt: string;
}

export interface SearchResult {
  entities: SearchEntity[];
  edges: SearchEdge[];
  episodes: SearchEpisode[];
}

interface EntityCandidate {
  id: string;
  type: string;
  display_name: string;
  summary: string;
  embedding: Uint8Array | null;
}

export async function searchMemory(opts: {
  db: Database;
  ollama: OllamaClient;
  embedModel?: string;
  input: SearchInput;
}): Promise<SearchResult> {
  const { db, ollama, embedModel, input } = opts;
  const limit = input.limit ?? 20;

  // Step 1: get query embedding
  const embResult = await ollama.embeddings({
    model: embedModel ?? 'bge-m3',
    prompt: input.query,
  });
  const queryVec = Float32Array.from(embResult.embedding);

  // Step 2: build SQL for candidates
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  if (input.entity_types && input.entity_types.length > 0) {
    const placeholders = input.entity_types.map(() => '?').join(', ');
    conditions.push(`type IN (${placeholders})`);
    params.push(...input.entity_types);
  }

  if (input.since) {
    conditions.push('last_updated_at >= ?');
    params.push(input.since);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT id, type, display_name, summary, embedding FROM memory_entities ${whereClause} LIMIT 200`;

  const rows = db.exec(sql, params.length > 0 ? params : undefined);
  const rawRows = rows[0]?.values ?? [];

  // Step 3: decode embeddings and compute cosine similarity
  const scored: Array<{ candidate: EntityCandidate; score: number }> = [];

  for (const row of rawRows) {
    const id = row[0] as string;
    const type = row[1] as string;
    const display_name = row[2] as string;
    const summary = row[3] as string;
    const embBlob = row[4] as Uint8Array | null;

    if (embBlob == null) {
      continue;
    }

    let entityVec: Float32Array;
    try {
      entityVec = decodeEmbedding(embBlob);
    } catch (_) {
      continue;
    }

    let score: number;
    try {
      score = cosineSimilarity(queryVec, entityVec);
    } catch (_) {
      // dim mismatch — skip
      continue;
    }

    scored.push({
      candidate: { id, type, display_name, summary, embedding: embBlob },
      score,
    });
  }

  // Step 4: sort and take top limit
  scored.sort((a, b) => b.score - a.score);
  const topScored = scored.slice(0, limit);
  const topEntities: SearchEntity[] = topScored.map(({ candidate, score }) => ({
    id: candidate.id,
    type: candidate.type,
    display_name: candidate.display_name,
    summary: candidate.summary,
    score,
  }));

  // Step 5/6: handle hops
  if ((input.hops ?? 1) === 0 || topEntities.length === 0) {
    return { entities: topEntities, edges: [], episodes: [] };
  }

  const topIds = topEntities.map((e) => e.id);

  // Step 6: query active edges
  const edgePlaceholders = topIds.map(() => '?').join(', ');
  const edgeRows = db.exec(
    `SELECT id, subject_entity_id, predicate, object_entity_id, object_literal, source_type, valid_from, source_ref, confidence_label
     FROM memory_edges
     WHERE subject_entity_id IN (${edgePlaceholders}) AND valid_to IS NULL`,
    topIds
  );

  const edges: SearchEdge[] = (edgeRows[0]?.values ?? []).map((row) => ({
    id: row[0] as string,
    subject_id: row[1] as string,
    predicate: row[2] as string,
    object_id: row[3] as string | null,
    object_literal: row[4] as string | null,
    source_type: row[5] as string,
    valid_from: row[6] as string,
    source_ref: row[7] as string,
    confidence_label: row[8] as string,
  }));

  // Step 7: get episodes (cap at 3 per entity)
  const epPlaceholders = topIds.map(() => '?').join(', ');
  const epRows = db.exec(
    `SELECT ee.entity_id, me.id, me.session_id, me.valid_from, me.raw_excerpt
     FROM memory_episode_entities ee
     JOIN memory_episodes me ON me.id = ee.episode_id
     WHERE ee.entity_id IN (${epPlaceholders})
     ORDER BY me.valid_from DESC`,
    topIds
  );

  // Collect episodes, cap 3 per entity
  const entityEpCount = new Map<string, number>();
  const seenEpisodeIds = new Set<string>();
  const episodes: SearchEpisode[] = [];

  for (const row of epRows[0]?.values ?? []) {
    const entityId = row[0] as string;
    const episodeId = row[1] as string;

    const count = entityEpCount.get(entityId) ?? 0;
    if (count >= 3) {
      continue;
    }

    // deduplicate episodes across entities
    if (seenEpisodeIds.has(episodeId)) {
      entityEpCount.set(entityId, count + 1);
      continue;
    }

    seenEpisodeIds.add(episodeId);
    entityEpCount.set(entityId, count + 1);

    episodes.push({
      id: episodeId,
      session_id: row[2] as string,
      valid_from: row[3] as string,
      raw_excerpt: row[4] as string,
    });
  }

  return { entities: topEntities, edges, episodes };
}
