import type { Database } from 'better-sqlite3';
import type { C4Model, ManualElement, ManualRelationship } from '@anytime-markdown/trail-core';
import { codeGraphToC4, mergeManualIntoC4Model } from '@anytime-markdown/trail-core';
import { all, get } from './sqlJsUtil';

/**
 * Phase H-2: c4_manual_* から repo_name 列を撤去したため、read の repo フィルタは repo_id = ? で行う。
 * read は副作用を避けるため repos へ upsert せず参照のみする。未登録の repo は -1 (どの行にも
 * マッチしない sentinel) を返し、空結果を返させる。
 */
function lookupRepoId(db: Database, repoName: string): number {
  const row = get<{ repo_id: number }>(db, 'SELECT repo_id FROM repos WHERE repo_name = ?', [repoName]);
  return row ? Number(row.repo_id) : -1;
}

// current_code_graphs.graph_json は trail-core の StoredCodeGraph 形式。
// import 時の型衝突を避けるため runtime はそのまま JSON.parse、型は構造のみ参照。
interface StoredCodeGraphJson {
  generatedAt: string;
  repositories: Array<{ id: string; label: string; path: string }>;
  nodes: Array<{
    id: string;
    label: string;
    repo: string;
    package: string;
    fileType: 'code' | 'document';
    community: number;
    communityLabel: string;
    x: number;
    y: number;
    size: number;
  }>;
  edges: Array<{ source: string; target: string; confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS'; confidence_score: number; crossRepo: boolean }>;
  godNodes: ReadonlyArray<string>;
}

export interface ListedElement {
  id: string;
  type: string;
  name: string;
  external?: boolean;
  manual?: boolean;
}

export interface ListedGroup {
  id: string;
  memberIds: string[];
  label?: string;
}

export interface ListedRelationship {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  technology?: string;
}

export interface CommunityRow {
  communityId: number;
  label: string;
  name: string;
  summary: string;
  mappingsJson: string | null;
  /**
   * コミュニティ内ノード ID 集合のコンテンツハッシュ。
   * 古いスキーマ（stable_key 列未追加）の DB では空文字を返す。
   * 詳細は `@anytime-markdown/trail-core/codeGraph` の computeStableKey 参照。
   */
  stableKey: string;
}

interface GraphRow {
  graph_json: string;
}

interface ManualElementRow {
  element_id: string;
  type: string;
  name: string;
  description: string | null;
  service_type: string | null;
  external: number;
  updated_at: string;
}

interface ManualRelationshipRow {
  rel_id: string;
  from_id: string;
  to_id: string;
  label: string | null;
  technology: string | null;
  updated_at: string;
}

interface ManualGroupRow {
  group_id: string;
  member_ids: string;
  label: string | null;
}

interface CommunityRowRaw {
  community_id: number;
  label: string;
  name: string;
  summary: string;
  mappings_json?: string | null;
  stable_key?: string | null;
}

export function getC4ModelDirect(db: Database, repoName: string): { model: C4Model } {
  // Phase H-2 / H-3: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う (read は upsert しない)。
  const repoId = lookupRepoId(db, repoName);

  const graphRow = get<GraphRow>(
    db,
    'SELECT graph_json FROM current_code_graphs WHERE repo_id = ?',
    [repoId],
  );

  const base: C4Model = graphRow
    ? codeGraphToC4(JSON.parse(graphRow.graph_json) as StoredCodeGraphJson)
    : { level: 'container', elements: [], relationships: [] };

  const manualElementRows = all<ManualElementRow>(
    db,
    'SELECT element_id, type, name, description, service_type, external, updated_at FROM c4_manual_elements WHERE repo_id = ? ORDER BY element_id',
    [repoId],
  );

  const manualElements: ManualElement[] = manualElementRows.map((row) => ({
    id: row.element_id,
    type: row.type as ManualElement['type'],
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    ...(row.service_type ? { serviceType: row.service_type } : {}),
    external: row.external === 1,
    parentId: null,
    updatedAt: row.updated_at,
  }));

  const manualRelationshipRows = all<ManualRelationshipRow>(
    db,
    'SELECT rel_id, from_id, to_id, label, technology, updated_at FROM c4_manual_relationships WHERE repo_id = ? ORDER BY rel_id',
    [repoId],
  );

  const manualRelationships: ManualRelationship[] = manualRelationshipRows.map((row) => ({
    id: row.rel_id,
    fromId: row.from_id,
    toId: row.to_id,
    ...(row.label ? { label: row.label } : {}),
    ...(row.technology ? { technology: row.technology } : {}),
    updatedAt: row.updated_at,
  }));

  const merged = mergeManualIntoC4Model(base, manualElements, manualRelationships);
  return { model: merged };
}

export function listElementsDirect(db: Database, repoName: string): ListedElement[] {
  const { model } = getC4ModelDirect(db, repoName);
  return model.elements.map((el) => {
    const item: ListedElement = { id: el.id, type: el.type, name: el.name };
    if (el.external === true) item.external = true;
    if ((el as { manual?: boolean }).manual === true) item.manual = true;
    return item;
  });
}

export function listGroupsDirect(db: Database, repoName: string): ListedGroup[] {
  // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う (read は upsert しない)。
  const repoId = lookupRepoId(db, repoName);
  const rows = all<ManualGroupRow>(
    db,
    'SELECT group_id, member_ids, label FROM c4_manual_groups WHERE repo_id = ? ORDER BY group_id',
    [repoId],
  );

  return rows.map((row) => {
    const item: ListedGroup = {
      id: row.group_id,
      memberIds: JSON.parse(row.member_ids) as string[],
    };
    if (row.label) item.label = row.label;
    return item;
  });
}

export function listRelationshipsDirect(db: Database, repoName: string): ListedRelationship[] {
  // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う (read は upsert しない)。
  const repoId = lookupRepoId(db, repoName);
  const rows = all<ManualRelationshipRow>(
    db,
    'SELECT rel_id, from_id, to_id, label, technology FROM c4_manual_relationships WHERE repo_id = ? ORDER BY rel_id',
    [repoId],
  );

  return rows.map((row) => {
    const item: ListedRelationship = { id: row.rel_id, fromId: row.from_id, toId: row.to_id };
    if (row.label) item.label = row.label;
    if (row.technology) item.technology = row.technology;
    return item;
  });
}

export function listCommunitiesDirect(db: Database, repoName: string): { communities: CommunityRow[] } {
  // Phase H-3: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う (read は upsert しない)。
  const repoId = lookupRepoId(db, repoName);
  // 古いスキーマ（mappings_json / stable_key 列未追加）への後方互換のため、列存在を try で段階的にフォールバック
  let rows: CommunityRowRaw[];
  try {
    rows = all<CommunityRowRaw>(
      db,
      'SELECT community_id, label, name, summary, mappings_json, stable_key FROM current_code_graph_communities WHERE repo_id = ? ORDER BY community_id',
      [repoId],
    );
  } catch (err) {
    console.error('[mcp-trail] listCommunitiesDirect: stable_key column not found, falling back', err);
    try {
      rows = all<CommunityRowRaw>(
        db,
        'SELECT community_id, label, name, summary, mappings_json FROM current_code_graph_communities WHERE repo_id = ? ORDER BY community_id',
        [repoId],
      );
    } catch (error_) {
      console.error('[mcp-trail] listCommunitiesDirect: mappings_json column not found, falling back', error_);
      rows = all<CommunityRowRaw>(
        db,
        'SELECT community_id, label, name, summary FROM current_code_graph_communities WHERE repo_id = ? ORDER BY community_id',
        [repoId],
      );
    }
  }

  const communities: CommunityRow[] = rows.map((row) => ({
    communityId: row.community_id,
    label: row.label,
    name: row.name,
    summary: row.summary,
    mappingsJson: row.mappings_json ?? null,
    stableKey: row.stable_key ?? '',
  }));

  return { communities };
}

export interface ProjectedCommunityNode {
  id: string;
  label: string;
  package: string;
}

export interface CommunityNodes {
  communityId: number;
  nodes: ProjectedCommunityNode[];
}

export function listCommunityNodesDirect(
  db: Database,
  repoName: string,
): { communities: CommunityNodes[] } {
  // Phase H-3: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う (read は upsert しない)。
  const repoId = lookupRepoId(db, repoName);
  const row = get<GraphRow>(
    db,
    'SELECT graph_json FROM current_code_graphs WHERE repo_id = ?',
    [repoId],
  );
  if (!row) return { communities: [] };

  const graph = JSON.parse(row.graph_json) as StoredCodeGraphJson;
  const byCommunity = new Map<number, ProjectedCommunityNode[]>();
  for (const n of graph.nodes ?? []) {
    const arr = byCommunity.get(n.community) ?? [];
    arr.push({
      id: n.id,
      label: n.label,
      package: n.package ?? '',
    });
    byCommunity.set(n.community, arr);
  }

  const communities: CommunityNodes[] = [...byCommunity.entries()]
    .sort(([a], [b]) => a - b)
    .map(([communityId, nodes]) => ({
      communityId,
      nodes: nodes.toSorted((a, b) => a.id.localeCompare(b.id)),
    }));

  return { communities };
}
