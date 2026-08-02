import type { BoundaryDriftWarning } from '@anytime-markdown/trail-core';

import type { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

const T0 = '2026-08-02T10:00:00.000Z';
const T1 = '2026-08-02T11:00:00.000Z';

function rawRun(db: TrailDatabase, sql: string, params?: unknown[]): void {
  const inner = (
    db as unknown as { ensureDb(): { run(sql: string, params?: unknown[]): void } }
  ).ensureDb();
  inner.run(sql, params);
}

function seedRepo(db: TrailDatabase, repoId: number, name: string): void {
  rawRun(db, `INSERT OR IGNORE INTO repos (repo_id, repo_name, created_at) VALUES (?, ?, ?)`, [
    repoId,
    name,
    T0,
  ]);
}

function spanning(communityId: number, severity = 4.5): BoundaryDriftWarning {
  return {
    kind: 'boundary_spanning',
    communityId,
    spanCount: 3,
    dominance: 0.4,
    nodeCount: 50,
    severity,
    breakdown: [
      { key: 'trail-server', nodeCount: 20 },
      { key: 'trail-core', nodeCount: 18 },
      { key: 'trail-db', nodeCount: 12 },
    ],
  };
}

function fragmentation(packageName: string, severity = 12): BoundaryDriftWarning {
  return {
    kind: 'package_fragmentation',
    packageName,
    communityCount: 12,
    nodeCount: 80,
    severity,
    breakdown: [{ key: '1', nodeCount: 40 }, { key: '2', nodeCount: 40 }],
  };
}

describe('TrailDatabase: boundary_drift_warnings', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    seedRepo(db, 1, 'anytime-markdown');
    seedRepo(db, 2, 'other-repo');
  });

  afterEach(() => {
    db.close();
  });

  it('警告を保存して読み戻せる', () => {
    const inserted = db.recordBoundaryDriftWarnings(1, T0, [spanning(3), fragmentation('web-app')]);

    expect(inserted).toBe(2);
    const rows = db.listBoundaryDriftWarnings({ repoId: 1 });
    expect(rows).toHaveLength(2);
  });

  it('boundary_spanning の指標と内訳が往復する', () => {
    db.recordBoundaryDriftWarnings(1, T0, [spanning(3)]);

    const row = db.listBoundaryDriftWarnings({ repoId: 1, kind: 'boundary_spanning' })[0];
    expect(row.targetKey).toBe('3');
    expect(row.spanCount).toBe(3);
    expect(row.dominance).toBeCloseTo(0.4, 5);
    expect(row.communityCount).toBeNull();
    expect(row.breakdown).toEqual([
      { key: 'trail-server', nodeCount: 20 },
      { key: 'trail-core', nodeCount: 18 },
      { key: 'trail-db', nodeCount: 12 },
    ]);
  });

  it('package_fragmentation では span 系が null になる', () => {
    db.recordBoundaryDriftWarnings(1, T0, [fragmentation('web-app')]);

    const row = db.listBoundaryDriftWarnings({ repoId: 1, kind: 'package_fragmentation' })[0];
    expect(row.targetKey).toBe('web-app');
    expect(row.communityCount).toBe(12);
    expect(row.spanCount).toBeNull();
    expect(row.dominance).toBeNull();
  });

  it('同一 (repo, 検出時刻, kind, 対象) の再投入は積まない', () => {
    db.recordBoundaryDriftWarnings(1, T0, [spanning(3)]);
    const second = db.recordBoundaryDriftWarnings(1, T0, [spanning(3)]);

    expect(second).toBe(0);
    expect(db.listBoundaryDriftWarnings({ repoId: 1 })).toHaveLength(1);
  });

  it('検出時刻が違えば履歴として積む（洗い替えない）', () => {
    db.recordBoundaryDriftWarnings(1, T0, [spanning(3)]);
    db.recordBoundaryDriftWarnings(1, T1, [spanning(3)]);

    const rows = db.listBoundaryDriftWarnings({ repoId: 1 });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.detectedAt))).toEqual(new Set([T0, T1]));
  });

  it('リポジトリで絞り込める', () => {
    db.recordBoundaryDriftWarnings(1, T0, [spanning(3)]);
    db.recordBoundaryDriftWarnings(2, T0, [spanning(9)]);

    expect(db.listBoundaryDriftWarnings({ repoId: 1 })).toHaveLength(1);
    expect(db.listBoundaryDriftWarnings({ repoId: 2 })[0].targetKey).toBe('9');
  });

  it('severity 降順で返り、minSeverity で絞れる', () => {
    db.recordBoundaryDriftWarnings(1, T0, [
      spanning(3, 2.0),
      spanning(4, 8.0),
      spanning(5, 5.0),
    ]);

    const all = db.listBoundaryDriftWarnings({ repoId: 1 });
    expect(all.map((r) => r.severity)).toEqual([8.0, 5.0, 2.0]);
    expect(db.listBoundaryDriftWarnings({ repoId: 1, minSeverity: 5 })).toHaveLength(2);
  });

  it('stable_key を渡すと boundary_spanning に記録される', () => {
    db.recordBoundaryDriftWarnings(1, T0, [spanning(3)], new Map([[3, 'e649a48f73ec02b7']]));

    expect(db.listBoundaryDriftWarnings({ repoId: 1 })[0].stableKey).toBe('e649a48f73ec02b7');
  });

  it('kind と指標の不整合を CHECK が拒む（union を DB 側でも崩さない）', () => {
    expect(() =>
      rawRun(
        db,
        `INSERT INTO boundary_drift_warnings
           (repo_id, detected_at, kind, target_key, node_count, severity)
         VALUES (1, ?, 'boundary_spanning', '3', 10, 1.0)`,
        [T0],
      ),
    ).toThrow();
  });

  it('リポジトリ削除で警告も消える（ON DELETE CASCADE）', () => {
    db.recordBoundaryDriftWarnings(1, T0, [spanning(3)]);
    rawRun(db, `PRAGMA foreign_keys = ON`);
    rawRun(db, `DELETE FROM repos WHERE repo_id = 1`);

    expect(db.listBoundaryDriftWarnings({ repoId: 1 })).toHaveLength(0);
  });

  it('該当なしで空配列を返す', () => {
    expect(db.listBoundaryDriftWarnings({ repoId: 1 })).toEqual([]);
  });

  it('警告 0 件でも検出回を記録する（健全と未解析を区別できるように）', () => {
    expect(db.recordBoundaryDriftWarnings(1, T0, [], new Map(), 2429)).toBe(0);

    const runs = db.listBoundaryDriftRuns({ repoId: 1 });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ detectedAt: T0, warningCount: 0, nodeCount: 2429 });
  });

  it('検出回に警告件数と対象ノード数を記録する', () => {
    db.recordBoundaryDriftWarnings(1, T0, [spanning(3), fragmentation('trail-core')], new Map(), 100);

    expect(db.listBoundaryDriftRuns({ repoId: 1 })[0]).toMatchObject({
      warningCount: 2,
      nodeCount: 100,
    });
  });

  it('検出回は新しい順に並び、repo で絞れる', () => {
    db.recordBoundaryDriftWarnings(1, T0, []);
    db.recordBoundaryDriftWarnings(1, T1, []);
    db.recordBoundaryDriftWarnings(2, T1, []);

    expect(db.listBoundaryDriftRuns({ repoId: 1 }).map((r) => r.detectedAt)).toEqual([T1, T0]);
    expect(db.listBoundaryDriftRuns()).toHaveLength(3);
  });

  it('同一 (repo, 検出時刻) の検出回を二重に積まない', () => {
    db.recordBoundaryDriftWarnings(1, T0, [spanning(3)], new Map(), 50);
    db.recordBoundaryDriftWarnings(1, T0, [spanning(3)], new Map(), 50);

    expect(db.listBoundaryDriftRuns({ repoId: 1 })).toHaveLength(1);
  });

  it('重複禁止が DB 側の制約になっている（アプリ層を迂回しても弾く）', () => {
    db.recordBoundaryDriftWarnings(1, T0, [spanning(3)]);

    expect(() =>
      rawRun(
        db,
        `INSERT INTO boundary_drift_warnings
           (repo_id, detected_at, kind, target_key, span_count, dominance, node_count, severity)
         VALUES (1, ?, 'boundary_spanning', '3', 3, 0.4, 10, 1.0)`,
        [T0],
      ),
    ).toThrow();
  });

  it('リポジトリ削除で検出回も消える（ON DELETE CASCADE）', () => {
    db.recordBoundaryDriftWarnings(1, T0, [], new Map(), 10);
    rawRun(db, `PRAGMA foreign_keys = ON`);
    rawRun(db, `DELETE FROM repos WHERE repo_id = 1`);

    expect(db.listBoundaryDriftRuns({ repoId: 1 })).toHaveLength(0);
  });
});
