// packages/mcp-trail/src/tools/discoveryShaping.ts
import type { ImportantFileRow } from './importantFiles';

// --- get_code_dependencies の edge 上限ガード -----------------------------

export interface CappedDependencies {
  node: unknown;
  incoming: unknown[];
  outgoing: unknown[];
  incomingTotal: number;
  outgoingTotal: number;
  truncated: boolean;
}

/**
 * explain の incoming/outgoing を limit 件で切り詰め、総数と truncated を付与する。
 * god-node（fanIn 数千）でも戻り値が膨張しないようにするガード。
 */
export function capDependencies(
  raw: { node?: unknown; incoming?: unknown[]; outgoing?: unknown[] },
  limit: number,
): CappedDependencies {
  const incoming = raw.incoming ?? [];
  const outgoing = raw.outgoing ?? [];
  const cappedIn = incoming.slice(0, limit);
  const cappedOut = outgoing.slice(0, limit);
  return {
    node: raw.node ?? null,
    incoming: cappedIn,
    outgoing: cappedOut,
    incomingTotal: incoming.length,
    outgoingTotal: outgoing.length,
    truncated: cappedIn.length < incoming.length || cappedOut.length < outgoing.length,
  };
}

// --- list_communities の mappings 既定除外 --------------------------------

export interface RawCommunity {
  communityId: number;
  label: string;
  name: string;
  summary: string;
  mappingsJson: string | null;
  stableKey: string;
}

/**
 * includeMappings=false（既定）のとき大きい mappingsJson を落として返す。true のときは元のまま。
 */
export function projectCommunities(
  raw: { communities?: RawCommunity[] },
  includeMappings: boolean,
): { communities: Array<RawCommunity | Omit<RawCommunity, 'mappingsJson'>> } {
  const communities = (raw.communities ?? []).map((c) =>
    includeMappings
      ? c
      : { communityId: c.communityId, label: c.label, name: c.name, summary: c.summary, stableKey: c.stableKey },
  );
  return { communities };
}

// --- list_community_nodes の絞り込み --------------------------------------

interface CommunityNodeGroup {
  communityId: number;
  nodes: unknown[];
}

export interface FilterCommunityNodesOptions {
  communityId?: number;
  nodeLimit?: number;
}

/**
 * communityId で対象コミュニティに絞り、nodeLimit でノードを切り詰める（切り詰め時 nodeTotal 付与）。
 * 全ノード（実測 ~1,898）を丸ごと返さないためのガード。
 */
export function filterCommunityNodes(
  raw: { communities?: CommunityNodeGroup[] },
  opts: FilterCommunityNodesOptions,
): { communities: Array<{ communityId: number; nodes: unknown[]; nodeTotal?: number }> } {
  let communities: Array<{ communityId: number; nodes: unknown[]; nodeTotal?: number }> =
    raw.communities ?? [];
  if (opts.communityId !== undefined) {
    communities = communities.filter((c) => c.communityId === opts.communityId);
  }
  if (opts.nodeLimit !== undefined) {
    const limit = opts.nodeLimit;
    communities = communities.map((c) => {
      const sliced = c.nodes.slice(0, limit);
      return {
        communityId: c.communityId,
        nodes: sliced,
        ...(sliced.length < c.nodes.length ? { nodeTotal: c.nodes.length } : {}),
      };
    });
  }
  return { communities };
}

// --- get_important_files の detail=summary 射影 ---------------------------

export interface SummaryFileRow {
  rank: number;
  filePath: string;
  importanceScore: number;
}

/** detail='summary' 用。rank/filePath/importanceScore だけに削る超圧縮射影。 */
export function toSummaryRows(rows: readonly ImportantFileRow[]): SummaryFileRow[] {
  return rows.map((r) => ({ rank: r.rank, filePath: r.filePath, importanceScore: r.importanceScore }));
}

// --- query_code_graph の node 上限ガード ----------------------------------

export interface CappedQueryResult {
  nodes: string[];
  edges: Array<{ source: string; target: string }>;
  nodeTotal: number;
  truncated: boolean;
}

/** query の nodes を limit 件に切り詰め（edges はそのまま）、nodeTotal/truncated を付与。 */
export function capQueryResult(
  raw: { nodes?: string[]; edges?: Array<{ source: string; target: string }> },
  limit: number,
): CappedQueryResult {
  const nodes = raw.nodes ?? [];
  const capped = nodes.slice(0, limit);
  return {
    nodes: capped,
    edges: raw.edges ?? [],
    nodeTotal: nodes.length,
    truncated: capped.length < nodes.length,
  };
}

// --- get_cochange_partners のファイル絞り込み -----------------------------

interface CochangeEdge {
  source: string;
  target: string;
  jaccard?: number;
}

export interface CochangePartner {
  partner: string;
  jaccard: number;
}

/** temporal-coupling の edges から file を含むものを抽出し、相手側＋jaccard を降順 top_n で返す。 */
export function filterCochangePartners(
  raw: { edges?: CochangeEdge[] },
  file: string,
  topN: number,
): CochangePartner[] {
  return (raw.edges ?? [])
    .filter((e) => e.source === file || e.target === file)
    .map((e) => ({ partner: e.source === file ? e.target : e.source, jaccard: e.jaccard ?? 0 }))
    .sort((a, b) => b.jaccard - a.jaccard)
    .slice(0, topN);
}
