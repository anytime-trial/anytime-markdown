import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  BetterSqlite3CaravanDb,
  runMigrations,
  type CaravanDbConnection,
} from '@anytime-markdown/trail-caravan-book';
import { runKnowledgeGraphLayout } from '../runKnowledgeGraphLayout';

const TS = '2026-08-08T00:00:00.000Z';

function insertEntity(db: CaravanDbConnection, id: string): void {
  db.run(
    `INSERT INTO caravan_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, ?, ?, ?)`,
    [id, id, id, TS, TS, TS],
  );
}

function insertEdge(db: CaravanDbConnection, id: string, subject: string, object: string): void {
  db.run(
    `INSERT INTO caravan_edges
       (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at,
        source_type, source_ref, confidence, confidence_label, modality)
     VALUES (?, ?, 'relates_to', ?, ?, ?, 'code', 'test', 1.0, 'EXTRACTED', 'asserted')`,
    [id, subject, object, TS, TS],
  );
}

function countLayout(db: CaravanDbConnection): number {
  return db.exec(`SELECT COUNT(*) FROM caravan_entity_layout`)[0]?.values[0][0] as number;
}

describe('runKnowledgeGraphLayout', () => {
  let tmpDir: string;
  let handle: BetterSqlite3CaravanDb;
  let db: CaravanDbConnection;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-layout-'));
    handle = new BetterSqlite3CaravanDb({ filePath: path.join(tmpDir, 'caravan-book.db') });
    db = handle;
    db.run('PRAGMA foreign_keys = ON');
    runMigrations(db);
    // 三角形 + 尾。連結成分が 1 つで、Louvain も ForceAtlas2 も安定に動く最小形
    for (const id of ['a', 'b', 'c', 'd']) insertEntity(db, id);
    insertEdge(db, 'e1', 'a', 'b');
    insertEdge(db, 'e2', 'b', 'c');
    insertEdge(db, 'e3', 'c', 'a');
    insertEdge(db, 'e4', 'c', 'd');
  });

  afterEach(() => {
    handle.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores finite coordinates and a community for every connected entity', () => {
    const result = runKnowledgeGraphLayout({ db, recordedAt: TS });

    expect(result.status).toBe('success');
    expect(result.nodes).toBe(4);
    expect(result.edges).toBe(4);
    expect(countLayout(db)).toBe(4);

    const rows = db.exec(`SELECT entity_id, x, y, community_id FROM caravan_entity_layout ORDER BY entity_id`);
    expect(rows[0]?.values.map((r) => r[0])).toEqual(['a', 'b', 'c', 'd']);
    for (const [, x, y] of rows[0].values) {
      expect(Number.isFinite(Number(x))).toBe(true);
      expect(Number.isFinite(Number(y))).toBe(true);
    }
    // 座標が全点同一だと図にならない（レイアウトが走っていない兆候）
    const xs = new Set(rows[0].values.map((r) => Number(r[1])));
    expect(xs.size).toBeGreaterThan(1);
  });

  it('stores the active-edge degree with multiplicity for every node', () => {
    // 平行辺を足す。配信側（deg CTE）はエッジ 1 行ごとに数えるため、保存する次数も
    // 多重度を数えなければ同じノードの円の大きさが経路で変わる
    insertEdge(db, 'e6', 'a', 'b');
    runKnowledgeGraphLayout({ db, recordedAt: TS });

    const rows = db.exec(`SELECT entity_id, degree FROM caravan_entity_layout ORDER BY entity_id`);
    expect(rows[0]?.values.map((r) => [String(r[0]), Number(r[1])])).toEqual([
      ['a', 3], ['b', 3], ['c', 3], ['d', 1],
    ]);
  });

  it('skips recomputation while the edge set is unchanged', () => {
    const first = runKnowledgeGraphLayout({ db, recordedAt: TS });
    const second = runKnowledgeGraphLayout({ db, recordedAt: TS });

    expect(first.status).toBe('success');
    expect(second.status).toBe('skipped');
    expect(second.detail).toBe('graph unchanged');
    expect(second.graph_version).toBe(first.graph_version);
  });

  it('recomputes once the edge set changes', () => {
    const first = runKnowledgeGraphLayout({ db, recordedAt: TS });
    insertEntity(db, 'e');
    insertEdge(db, 'e5', 'd', 'e');
    const second = runKnowledgeGraphLayout({ db, recordedAt: TS });

    expect(second.status).toBe('success');
    expect(second.graph_version).not.toBe(first.graph_version);
    expect(countLayout(db)).toBe(5);
  });

  it('derives the same graph_version regardless of row order', () => {
    const first = runKnowledgeGraphLayout({ db, recordedAt: TS });
    // 同じエッジを id だけ変えて入れ直す（SQL の返す順が変わっても版は変わらないこと）
    db.run(`DELETE FROM caravan_edges`);
    insertEdge(db, 'z4', 'c', 'd');
    insertEdge(db, 'z3', 'c', 'a');
    insertEdge(db, 'z2', 'b', 'c');
    insertEdge(db, 'z1', 'a', 'b');
    const second = runKnowledgeGraphLayout({ db, recordedAt: TS });

    expect(second.status).toBe('skipped');
    expect(second.graph_version).toBe(first.graph_version);
  });

  it('ignores soft-deleted endpoints and invalidated edges', () => {
    runKnowledgeGraphLayout({ db, recordedAt: TS });
    // d を soft delete → d を端点に持つ e4 は無効になり、残るのは三角形だけ
    db.run(`UPDATE caravan_entities SET valid_until = ? WHERE id = 'd'`, [TS]);
    const result = runKnowledgeGraphLayout({ db, recordedAt: TS });

    expect(result.status).toBe('success');
    expect(result.edges).toBe(3);
    expect(result.nodes).toBe(3);
    expect(countLayout(db)).toBe(3);
  });

  it('skips when there is no active edge instead of writing an empty layout', () => {
    db.run(`DELETE FROM caravan_edges`);
    const result = runKnowledgeGraphLayout({ db, recordedAt: TS });

    expect(result.status).toBe('skipped');
    expect(result.detail).toBe('no active edges');
    expect(countLayout(db)).toBe(0);
  });

  it('recomputes when forced even though the graph is unchanged', () => {
    runKnowledgeGraphLayout({ db, recordedAt: TS });
    const forced = runKnowledgeGraphLayout({ db, recordedAt: TS, force: true });

    expect(forced.status).toBe('success');
  });
});
