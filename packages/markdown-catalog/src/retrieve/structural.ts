/**
 * 構造検索（型付き関係のグラフクエリ）。索引済みなので backlink/型別/近傍が O(log n)。
 */

import type { DocDb } from '../db/open';
import type { RelationType } from '../types';

export interface RelationEdge {
  path: string;
  type: RelationType;
}

/** X を指す関係（バックリンク: 誰が X を to にしているか）。type で絞り込み可。 */
export function backlinks(db: DocDb, toPath: string, type?: RelationType): RelationEdge[] {
  const sql = type
    ? 'SELECT from_path AS path, type FROM doc_relation WHERE to_path = ? AND type = ?'
    : 'SELECT from_path AS path, type FROM doc_relation WHERE to_path = ?';
  const rows = type ? db.prepare(sql).all(toPath, type) : db.prepare(sql).all(toPath);
  return rows as unknown as RelationEdge[];
}

/** X から出る関係（前方リンク）。type で絞り込み可。 */
export function forwardLinks(db: DocDb, fromPath: string, type?: RelationType): RelationEdge[] {
  const sql = type
    ? 'SELECT to_path AS path, type FROM doc_relation WHERE from_path = ? AND type = ?'
    : 'SELECT to_path AS path, type FROM doc_relation WHERE from_path = ?';
  const rows = type ? db.prepare(sql).all(fromPath, type) : db.prepare(sql).all(fromPath);
  return rows as unknown as RelationEdge[];
}

export interface NeighborOptions {
  /** ホップ数（既定 1）。 */
  hops?: number;
  /** 含める関係型（未指定なら全型）。 */
  types?: readonly RelationType[];
}

/**
 * 中心から hops 以内の無向近傍ノード（中心含む）を返す。型で絞り込み可。
 * note-graph の `buildNoteNeighborhood` と同じ無向 BFS を DB 上で行う。
 */
export function neighbors(db: DocDb, centerPath: string, opts: NeighborOptions = {}): string[] {
  const hops = Math.max(1, opts.hops ?? 1);
  const typeSet = opts.types ? new Set(opts.types) : null;
  const fwd = db.prepare('SELECT to_path AS path, type FROM doc_relation WHERE from_path = ?');
  const bwd = db.prepare('SELECT from_path AS path, type FROM doc_relation WHERE to_path = ?');

  const adj = (node: string): string[] => {
    const rows = [
      ...(fwd.all(node) as unknown as RelationEdge[]),
      ...(bwd.all(node) as unknown as RelationEdge[]),
    ];
    return rows.filter((r) => !typeSet || typeSet.has(r.type)).map((r) => r.path);
  };

  const visited = new Set<string>([centerPath]);
  let frontier = [centerPath];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const n of frontier) {
      for (const m of adj(n)) {
        if (!visited.has(m)) {
          visited.add(m);
          next.push(m);
        }
      }
    }
    frontier = next;
  }
  return [...visited];
}

/** category でドキュメントパスを引く。 */
export function byCategory(db: DocDb, category: string): string[] {
  const rows = db.prepare('SELECT path FROM doc WHERE category = ? ORDER BY path').all(category) as unknown as {
    path: string;
  }[];
  return rows.map((r) => r.path);
}
