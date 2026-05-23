import type { Database } from 'better-sqlite3';
import { all, get, run } from './sqlJsUtil';

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Phase E flip: c4_manual_* は repo_id NOT NULL PK へ移行した。repo_name から repo_id を
 * 解決する (未登録なら repos へ upsert してから返す・冪等)。trail-db の repoIdForName と同等の
 * 小ヘルパを mcp-trail 側に持つ (mcp-trail は TrailDatabase を経由せず直接 SQL を書くため)。
 * Phase H-2: c4_manual_* から repo_name 列を撤去した。INSERT 列から repo_name を除き、
 * UPDATE / DELETE の repo フィルタは resolveRepoId で解決した repo_id = ? で行う。
 */
function resolveRepoId(db: Database, repoName: string): number {
  run(
    db,
    `INSERT INTO repos (repo_name, created_at)
       VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(repo_name) DO NOTHING`,
    [repoName],
  );
  const row = get<{ repo_id: number }>(db, 'SELECT repo_id FROM repos WHERE repo_name = ?', [repoName]);
  return Number(row?.repo_id ?? 0);
}

export function upsertCommunitySummariesDirect(
  db: Database,
  repoName: string,
  rows: ReadonlyArray<{ communityId: number; name: string; summary: string }>,
): { updated: number } {
  // Phase H-3: current_code_graph_communities から repo_name 列を撤去した。INSERT 列から repo_name を
  // 除き、UPDATE / INSERT の repo フィルタ・PK は resolveRepoId で解決した repo_id = ? で行う。
  const repoId = resolveRepoId(db, repoName);
  let updated = 0;
  for (const row of rows) {
    const result = run(
      db,
      `UPDATE current_code_graph_communities SET name = ?, summary = ?, updated_at = datetime('now') WHERE repo_id = ? AND community_id = ?`,
      [row.name, row.summary, repoId, row.communityId],
    );
    if (result.changes === 0) {
      run(
        db,
        `INSERT INTO current_code_graph_communities (repo_id, community_id, label, name, summary, generated_at, updated_at) VALUES (?, ?, '', ?, ?, datetime('now'), datetime('now'))`,
        [repoId, row.communityId, row.name, row.summary],
      );
    } else {
      updated++;
    }
  }
  return { updated };
}

export function upsertCommunityMappingsDirect(
  db: Database,
  repoName: string,
  rows: ReadonlyArray<{
    communityId: number;
    mappings: ReadonlyArray<{ elementId: string; elementType: string; role: 'primary' | 'secondary' | 'dependency' }>;
  }>,
): { updated: number; inserted: number } {
  // Ensure mappings_json column exists
  const cols = all<{ name: string }>(db, 'PRAGMA table_info(current_code_graph_communities)');
  const hasMappingsJson = cols.some((c) => c.name === 'mappings_json');
  if (!hasMappingsJson) {
    run(db, 'ALTER TABLE current_code_graph_communities ADD COLUMN mappings_json TEXT');
  }

  // Phase H-3: current_code_graph_communities から repo_name 列を撤去した。INSERT 列から repo_name を
  // 除き、UPDATE / INSERT の repo フィルタ・PK は resolveRepoId で解決した repo_id = ? で行う。
  const repoId = resolveRepoId(db, repoName);
  let updated = 0;
  let inserted = 0;
  for (const row of rows) {
    const mappingsJson = JSON.stringify(row.mappings);
    const result = run(
      db,
      `UPDATE current_code_graph_communities SET mappings_json = ?, updated_at = datetime('now') WHERE repo_id = ? AND community_id = ?`,
      [mappingsJson, repoId, row.communityId],
    );
    if (result.changes === 0) {
      run(
        db,
        `INSERT INTO current_code_graph_communities (repo_id, community_id, label, name, summary, mappings_json, generated_at, updated_at) VALUES (?, ?, '', '', '', ?, datetime('now'), datetime('now'))`,
        [repoId, row.communityId, mappingsJson],
      );
      inserted++;
    } else {
      updated++;
    }
  }
  return { updated, inserted };
}

export function addElementDirect(
  db: Database,
  repoName: string,
  body: {
    type: string;
    name: string;
    external: boolean;
    parentId: string | null;
    description?: string;
    serviceType?: string;
  },
): { id: string } {
  const elementId = genId('man');
  const repoId = resolveRepoId(db, repoName);
  run(
    db,
    `INSERT INTO c4_manual_elements (repo_id, element_id, type, name, description, external, parent_id, service_type, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      repoId,
      elementId,
      body.type,
      body.name,
      body.description ?? null,
      body.external ? 1 : 0,
      body.parentId,
      body.serviceType ?? null,
    ],
  );
  return { id: elementId };
}

export function updateElementDirect(
  db: Database,
  repoName: string,
  id: string,
  changes: { name?: string; description?: string; external?: boolean; serviceType?: string },
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (changes.name !== undefined) {
    sets.push('name = ?');
    params.push(changes.name);
  }
  if (changes.description !== undefined) {
    sets.push('description = ?');
    params.push(changes.description);
  }
  if (changes.external !== undefined) {
    sets.push('external = ?');
    params.push(changes.external ? 1 : 0);
  }
  if (changes.serviceType !== undefined) {
    sets.push('service_type = ?');
    params.push(changes.serviceType);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
  const repoId = resolveRepoId(db, repoName);
  run(
    db,
    `UPDATE c4_manual_elements SET ${sets.join(', ')} WHERE repo_id = ? AND element_id = ?`,
    [...params, repoId, id],
  );
}

export function removeElementDirect(db: Database, repoName: string, id: string): void {
  // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
  const repoId = resolveRepoId(db, repoName);
  run(
    db,
    `DELETE FROM c4_manual_relationships WHERE repo_id = ? AND (from_id = ? OR to_id = ?)`,
    [repoId, id, id],
  );
  run(db, `DELETE FROM c4_manual_elements WHERE repo_id = ? AND element_id = ?`, [repoId, id]);
}

export function addGroupDirect(
  db: Database,
  repoName: string,
  body: { memberIds: ReadonlyArray<string>; label?: string },
): { id: string } {
  const groupId = genId('grp');
  const repoId = resolveRepoId(db, repoName);
  run(
    db,
    `INSERT INTO c4_manual_groups (repo_id, group_id, member_ids, label, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    [repoId, groupId, JSON.stringify(body.memberIds), body.label ?? ''],
  );
  return { id: groupId };
}

export function updateGroupDirect(
  db: Database,
  repoName: string,
  id: string,
  body: { memberIds?: ReadonlyArray<string>; label?: string | null },
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (body.memberIds !== undefined) {
    sets.push('member_ids = ?');
    params.push(JSON.stringify(body.memberIds));
  }
  if ('label' in body) {
    sets.push('label = ?');
    params.push(body.label);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
  const repoId = resolveRepoId(db, repoName);
  run(
    db,
    `UPDATE c4_manual_groups SET ${sets.join(', ')} WHERE repo_id = ? AND group_id = ?`,
    [...params, repoId, id],
  );
}

export function removeGroupDirect(db: Database, repoName: string, id: string): void {
  // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
  const repoId = resolveRepoId(db, repoName);
  run(db, `DELETE FROM c4_manual_groups WHERE repo_id = ? AND group_id = ?`, [repoId, id]);
}

export function addRelationshipDirect(
  db: Database,
  repoName: string,
  body: { fromId: string; toId: string; label?: string; technology?: string },
): { id: string } {
  const relId = genId('rel');
  const repoId = resolveRepoId(db, repoName);
  run(
    db,
    `INSERT INTO c4_manual_relationships (repo_id, rel_id, from_id, to_id, label, technology, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [repoId, relId, body.fromId, body.toId, body.label ?? null, body.technology ?? null],
  );
  return { id: relId };
}

export function removeRelationshipDirect(db: Database, repoName: string, id: string): void {
  // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
  const repoId = resolveRepoId(db, repoName);
  run(db, `DELETE FROM c4_manual_relationships WHERE repo_id = ? AND rel_id = ?`, [repoId, id]);
}
