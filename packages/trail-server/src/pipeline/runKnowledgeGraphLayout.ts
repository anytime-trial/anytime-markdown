import { createHash } from 'node:crypto';
import Graph from 'graphology';
import type { CaravanDbConnection } from '@anytime-markdown/trail-caravan-book';
import { GraphClusterer } from '../analyze/GraphClusterer';
import { GraphLayout } from '../analyze/GraphLayout';

/**
 * ForceAtlas2 の反復回数。100 は `GraphLayout` の既定と同じ。
 *
 * 実測（合成グラフ・ノード数の 2 倍のエッジ）: 25,000 ノードで 15.3 秒・100,000 ノードで 72.7 秒。
 * 閲覧のたびに払える値ではないため、本パイプラインは背景で 1 度だけ回して結果を保存する。
 */
const LAYOUT_ITERATIONS = 100;

export interface KnowledgeGraphLayoutResult {
  status: 'success' | 'skipped' | 'error';
  /** レイアウトの計算元になったエッジ集合のハッシュ。 */
  graph_version: string;
  nodes: number;
  edges: number;
  communities: number;
  duration_ms: number;
  /** skip / error の理由。成功時は空文字。 */
  detail: string;
}

interface EdgeRow {
  readonly s: string;
  readonly o: string;
}

/**
 * 有効エッジ（`getKnowledgeGraph` の `active` と同じ条件）を読む。
 *
 * 条件をここで再定義しているのは、配信側（`CaravanApiHandler`）と計算側で「どのエッジが
 * 生きているか」がずれると、座標を持たないノードが配信され続けるため。両者は同じ条件で
 * なければならない。
 */
function readActiveEdges(db: CaravanDbConnection): EdgeRow[] {
  const stmt = db.prepare(
    `SELECT e.subject_entity_id AS s, e.object_entity_id AS o
       FROM caravan_edges e
       JOIN caravan_entities es ON es.id = e.subject_entity_id
       JOIN caravan_entities eo ON eo.id = e.object_entity_id
      WHERE e.object_entity_id IS NOT NULL
        AND e.subject_entity_id != e.object_entity_id
        AND e.valid_to IS NULL
        AND es.valid_until IS NULL
        AND eo.valid_until IS NULL
        AND NOT EXISTS (SELECT 1 FROM caravan_edge_invalidations i WHERE i.edge_id = e.id)`,
  );
  try {
    const rows: EdgeRow[] = [];
    for (const row of stmt.iterate()) {
      rows.push({ s: row['s'] as string, o: row['o'] as string });
    }
    return rows;
  } finally {
    stmt.free?.();
  }
}

/**
 * エッジ集合の指紋。同じ集合なら同じ値になり、順序には依存しない。
 *
 * 順序非依存にするのは、SQL の返す順が索引の選ばれ方で変わるため。順序に依存させると、
 * 中身が同じでも版が変わったと誤判定して 70 秒のレイアウトを回し直す。
 */
function computeGraphVersion(edges: readonly EdgeRow[]): string {
  const pairs = edges.map(({ s, o }) => (s < o ? `${s}>${o}` : `${o}>${s}`));
  pairs.sort();
  const hash = createHash('sha1');
  for (const pair of pairs) hash.update(pair).update('\n');
  return `${edges.length}:${hash.digest('hex').slice(0, 16)}`;
}

function readStoredVersion(db: CaravanDbConnection): string | null {
  const stmt = db.prepare(`SELECT graph_version FROM caravan_entity_layout LIMIT 1`);
  try {
    const row = stmt.get();
    return row ? ((row['graph_version'] as string) ?? null) : null;
  } finally {
    stmt.free?.();
  }
}

/**
 * 有効エッジ次数。**多重度を数える**（同じ 2 点間に 2 本あれば両端とも 2 加算）。
 *
 * `Graph#degree` を使わないのは、`buildGraph` が平行辺を 1 本に畳むため値がずれるから。
 * 配信側（`CaravanApiHandler` の `deg` CTE）はエッジ 1 行ごとに数えており、そちらが
 * `frequency` の定義（画面設計書 §2.2）である。ここが食い違うと、同じノードの円の
 * 大きさが視野の取り方で変わる。
 */
function computeDegrees(edges: readonly EdgeRow[]): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const { s, o } of edges) {
    degrees.set(s, (degrees.get(s) ?? 0) + 1);
    degrees.set(o, (degrees.get(o) ?? 0) + 1);
  }
  return degrees;
}

function buildGraph(edges: readonly EdgeRow[]): Graph {
  const graph = new Graph({ type: 'undirected' });
  for (const { s, o } of edges) {
    if (!graph.hasNode(s)) graph.addNode(s);
    if (!graph.hasNode(o)) graph.addNode(o);
    if (!graph.hasEdge(s, o)) graph.addEdge(s, o);
  }
  return graph;
}

/**
 * 知識グラフ全体の座標とコミュニティを計算して `caravan_entity_layout` へ保存する。
 *
 * クライアントは受け取った座標をそのまま使う（`CooccurrenceFile.layout.source = 'server'`）。
 * これにより初回描画のコストが「画面に出す件数」だけで決まり、グラフ全体の大きさから
 * 独立する。エッジを持たないエンティティは配信対象外なので座標も持たせない。
 *
 * エッジ集合が前回と同一なら計算しない（`graph_version` で判定）。
 */
export function runKnowledgeGraphLayout(opts: {
  db: CaravanDbConnection;
  recordedAt: string;
  /** true なら `graph_version` が同一でも計算し直す。 */
  force?: boolean;
  logger?: { info(message: string): void; error(message: string, error?: unknown): void };
}): KnowledgeGraphLayoutResult {
  const { db, recordedAt } = opts;
  const started = Date.now();
  const done = (
    status: KnowledgeGraphLayoutResult['status'],
    fields: Partial<KnowledgeGraphLayoutResult>,
  ): KnowledgeGraphLayoutResult => ({
    status,
    graph_version: '',
    nodes: 0,
    edges: 0,
    communities: 0,
    detail: '',
    ...fields,
    duration_ms: Date.now() - started,
  });

  try {
    const edges = readActiveEdges(db);
    if (edges.length === 0) {
      return done('skipped', { detail: 'no active edges' });
    }

    const graphVersion = computeGraphVersion(edges);
    if (opts.force !== true && readStoredVersion(db) === graphVersion) {
      return done('skipped', { graph_version: graphVersion, edges: edges.length, detail: 'graph unchanged' });
    }

    const graph = buildGraph(edges);
    const degrees = computeDegrees(edges);
    const { communities } = new GraphClusterer().cluster(graph);
    new GraphLayout().apply(graph, LAYOUT_ITERATIONS);

    // 全消し → 全入れ。差分更新にしないのは、レイアウトが全体最適で毎回すべての座標が
    // 変わるため（一部だけ更新すると古い座標と新しい座標が同じ図に混ざる）。
    db.run(`DELETE FROM caravan_entity_layout`);
    let stored = 0;
    graph.forEachNode((nodeId, attrs) => {
      const x = attrs['x'];
      const y = attrs['y'];
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
        opts.logger?.error(
          `[knowledge-graph-layout] skipped entity without finite coordinates id=${nodeId}`,
        );
        return;
      }
      db.run(
        `INSERT INTO caravan_entity_layout (entity_id, x, y, community_id, degree, graph_version, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(entity_id) DO UPDATE SET
           x = excluded.x, y = excluded.y, community_id = excluded.community_id,
           degree = excluded.degree,
           graph_version = excluded.graph_version, recorded_at = excluded.recorded_at`,
        [nodeId, x, y, communities[nodeId] ?? 0, degrees.get(nodeId) ?? 0, graphVersion, recordedAt],
      );
      stored += 1;
    });

    const communityCount = new Set(Object.values(communities)).size;
    opts.logger?.info(
      `[knowledge-graph-layout] nodes=${stored} edges=${edges.length} communities=${communityCount} version=${graphVersion}`,
    );
    return done('success', {
      graph_version: graphVersion,
      nodes: stored,
      edges: edges.length,
      communities: communityCount,
    });
  } catch (error) {
    opts.logger?.error('[knowledge-graph-layout] failed', error);
    return done('error', { detail: error instanceof Error ? error.message : String(error) });
  }
}
