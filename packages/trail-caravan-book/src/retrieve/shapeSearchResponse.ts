import type { CaravanDbConnection } from '../db/connection/types';
import type { SearchEdge, SearchEpisode } from './searchCaravanBook';
import type { HybridSearchResult } from '../rag/hybridSearchCaravanBook';

/**
 * 検索応答の段階開示（spec memory-core §7.5・proposal 20260809 U2a）。
 *
 * 消費者（AI エージェント）のコンテキスト予算を応答契約に組み込む。
 * 既定 compact は 1 実体 1 行相当・エッジ (s,p,o) 集約・エピソード抜粋のみを返し、
 * `id` による追撃取得（get_entity / get_episode）で深掘りする前提の形。
 */

export type SearchDetail = 'compact' | 'normal' | 'full';

export const COMPACT_SUMMARY_MAX_CHARS = 80;
export const COMPACT_EPISODE_EXCERPT_MAX_CHARS = 200;
export const COMPACT_EDGES_MAX = 30;
export const COMPACT_EPISODES_MAX = 3;

export interface AggregatedEdge {
  subject_name: string;
  predicate: string;
  object_name: string;
  /** 同一 (subject, predicate, object) の観測回数（重複列挙の代わりに重みとして返す） */
  count: number;
  last_valid_from: string;
}

export interface ShapedEntity {
  id: string;
  type: string;
  display_name: string;
  summary: string;
  score: number;
  sources?: ReadonlyArray<string>;
  raw_scores?: { bm25_rank?: number; cosine?: number };
  community?: { name: string };
  /** full のみ */
  aliases?: string[];
}

export interface ShapedEpisode {
  id: string;
  session_id: string;
  valid_from: string;
  raw_excerpt: string;
}

export interface ShapedSearchResult {
  matched: boolean;
  no_confident_match?: true;
  detail: SearchDetail;
  entities: ShapedEntity[];
  edges: SearchEdge[] | AggregatedEdge[];
  episodes: ShapedEpisode[];
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * (subject, predicate, object) 単位でエッジを集約し観測回数を weight として返す。
 * 同一ペア間の session 違い重複（実測で同一 (s,p,o) が 3 本）を 1 行に畳む。
 */
export function aggregateEdges(edges: SearchEdge[]): AggregatedEdge[] {
  const byKey = new Map<string, AggregatedEdge>();
  for (const edge of edges) {
    const subjectName = edge.subject_name ?? edge.subject_id;
    const objectName = edge.object_name ?? edge.object_literal ?? edge.object_id ?? '';
    const key = `${subjectName}|${edge.predicate}|${objectName}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (edge.valid_from > existing.last_valid_from) existing.last_valid_from = edge.valid_from;
    } else {
      byKey.set(key, {
        subject_name: subjectName,
        predicate: edge.predicate,
        object_name: objectName,
        count: 1,
        last_valid_from: edge.valid_from,
      });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || (a.last_valid_from < b.last_valid_from ? 1 : -1),
  );
}

/** full 用: entity id → aliases（aliases_json のパース結果） */
export function fetchEntityAliases(db: CaravanDbConnection, ids: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (ids.length === 0) return result;
  const ph = ids.map(() => '?').join(', ');
  const rows = db.exec(`SELECT id, aliases_json FROM caravan_entities WHERE id IN (${ph})`, ids);
  for (const row of rows[0]?.values ?? []) {
    const id = row[0] as string;
    try {
      const parsed: unknown = JSON.parse((row[1] as string) || '[]');
      if (Array.isArray(parsed)) {
        result.set(id, parsed.filter((a): a is string => typeof a === 'string'));
      }
    } catch (err) {
      // aliases_json は CHECK (json_valid) 済み。壊れていても aliases 無しで返すが、無言にはしない
      // eslint-disable-next-line no-console
      console.warn(
        `[${new Date().toISOString()}] [WARN] fetchEntityAliases: broken aliases_json id=${id}: ${String(err)}`,
      );
    }
  }
  return result;
}

export function shapeSearchResponse(
  result: HybridSearchResult,
  detail: SearchDetail,
  aliases?: Map<string, string[]>,
): ShapedSearchResult {
  const base: Pick<ShapedSearchResult, 'matched' | 'no_confident_match' | 'detail'> = {
    matched: result.matched,
    ...(result.no_confident_match === true ? { no_confident_match: true as const } : {}),
    detail,
  };

  if (detail === 'compact') {
    const seenEpisodes: ShapedEpisode[] = result.episodes.slice(0, COMPACT_EPISODES_MAX).map((ep) => ({
      id: ep.id,
      session_id: ep.session_id,
      valid_from: ep.valid_from,
      raw_excerpt: truncate(ep.raw_excerpt, COMPACT_EPISODE_EXCERPT_MAX_CHARS),
    }));
    return {
      ...base,
      entities: result.entities.map((e) => ({
        id: e.id,
        type: e.type,
        display_name: e.display_name,
        summary: truncate(e.summary, COMPACT_SUMMARY_MAX_CHARS),
        score: e.score,
        ...(e.sources !== undefined ? { sources: e.sources } : {}),
        ...(e.raw_scores !== undefined ? { raw_scores: e.raw_scores } : {}),
        ...(e.community !== undefined ? { community: e.community } : {}),
      })),
      edges: aggregateEdges(result.edges).slice(0, COMPACT_EDGES_MAX),
      episodes: seenEpisodes,
    };
  }

  const shapedEntities: ShapedEntity[] = result.entities.map((e) => ({
    id: e.id,
    type: e.type,
    display_name: e.display_name,
    summary: e.summary,
    score: e.score,
    ...(e.sources !== undefined ? { sources: e.sources } : {}),
    ...(e.raw_scores !== undefined ? { raw_scores: e.raw_scores } : {}),
    ...(e.community !== undefined ? { community: e.community } : {}),
    ...(detail === 'full' && aliases?.has(e.id) ? { aliases: aliases.get(e.id) } : {}),
  }));

  return {
    ...base,
    entities: shapedEntities,
    edges: result.edges,
    episodes: result.episodes.map((ep: SearchEpisode) => ({ ...ep })),
  };
}
