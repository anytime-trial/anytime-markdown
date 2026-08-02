import BetterSqlite3, { type Database } from 'better-sqlite3';
import {
  CREATE_BOUNDARY_DRIFT_INDEXES,
  CREATE_BOUNDARY_DRIFT_WARNINGS,
} from '@anytime-markdown/trail-core';

import { listBoundaryDriftDirect } from '../../sqlite/boundaryDrift';

const OLD_RUN = '2026-08-01T00:00:00.000Z';
const NEW_RUN = '2026-08-02T00:00:00.000Z';

function createDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(
    `CREATE TABLE repos (repo_id INTEGER PRIMARY KEY, repo_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)`,
  );
  db.exec(CREATE_BOUNDARY_DRIFT_WARNINGS);
  for (const idx of CREATE_BOUNDARY_DRIFT_INDEXES) db.exec(idx);
  db.prepare('INSERT INTO repos (repo_id, repo_name, created_at) VALUES (?, ?, ?)').run(
    1,
    'anytime-markdown',
    NEW_RUN,
  );
  db.prepare('INSERT INTO repos (repo_id, repo_name, created_at) VALUES (?, ?, ?)').run(
    2,
    'other-repo',
    NEW_RUN,
  );
  return db;
}

function insertSpanning(
  db: Database,
  args: { repoId?: number; detectedAt?: string; target: string; severity: number; spanCount?: number },
): void {
  db.prepare(
    `INSERT INTO boundary_drift_warnings
       (repo_id, detected_at, kind, target_key, stable_key, span_count, dominance,
        community_count, node_count, severity, breakdown_json)
     VALUES (?, ?, 'boundary_spanning', ?, ?, ?, 0.4, NULL, 10, ?, ?)`,
  ).run(
    args.repoId ?? 1,
    args.detectedAt ?? NEW_RUN,
    args.target,
    `key-${args.target}`,
    args.spanCount ?? 3,
    args.severity,
    JSON.stringify([{ key: 'pkg-a', nodeCount: 6 }, { key: 'pkg-b', nodeCount: 4 }]),
  );
}

function insertFragmentation(
  db: Database,
  args: { repoId?: number; detectedAt?: string; target: string; severity: number },
): void {
  db.prepare(
    `INSERT INTO boundary_drift_warnings
       (repo_id, detected_at, kind, target_key, stable_key, span_count, dominance,
        community_count, node_count, severity, breakdown_json)
     VALUES (?, ?, 'package_fragmentation', ?, '', NULL, NULL, 12, 40, ?, ?)`,
  ).run(
    args.repoId ?? 1,
    args.detectedAt ?? NEW_RUN,
    args.target,
    args.severity,
    JSON.stringify([{ key: '3', nodeCount: 20 }]),
  );
}

describe('listBoundaryDriftDirect', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb();
  });

  afterEach(() => {
    db.close();
  });

  it('severity 降順で最新の検出回だけを返す', () => {
    insertSpanning(db, { detectedAt: OLD_RUN, target: '3', severity: 9 });
    insertSpanning(db, { target: '3', severity: 1.5 });
    insertFragmentation(db, { target: 'trail-core', severity: 4 });

    const result = listBoundaryDriftDirect(db);

    expect(result.detectedAt).toBe(NEW_RUN);
    expect(result.warnings.map((w) => w.severity)).toEqual([4, 1.5]);
    // 古い回の severity=9 は混ざらない（「今どうなっているか」を読めなくするため）。
    expect(result.warnings.every((w) => w.detectedAt === NEW_RUN)).toBe(true);
  });

  it('includeHistory 相当（latestOnly=false）で過去の回も返す', () => {
    insertSpanning(db, { detectedAt: OLD_RUN, target: '3', severity: 9 });
    insertSpanning(db, { target: '3', severity: 1.5 });

    const result = listBoundaryDriftDirect(db, { latestOnly: false });

    expect(result.detectedAt).toBeNull();
    expect(result.warnings.map((w) => w.detectedAt)).toEqual([OLD_RUN, NEW_RUN]);
  });

  it('kind と minSeverity で絞り込める', () => {
    insertSpanning(db, { target: '3', severity: 1.5 });
    insertFragmentation(db, { target: 'trail-core', severity: 4 });

    expect(listBoundaryDriftDirect(db, { kind: 'boundary_spanning' }).warnings).toHaveLength(1);
    expect(listBoundaryDriftDirect(db, { minSeverity: 2 }).warnings.map((w) => w.target)).toEqual([
      'trail-core',
    ]);
  });

  it('kind で絞っても最新回の特定は絞り込み前に行う', () => {
    // 最新回には fragmentation しか無い。spanning だけを見たとき、古い回へ遡らないこと。
    insertSpanning(db, { detectedAt: OLD_RUN, target: '3', severity: 9 });
    insertFragmentation(db, { target: 'trail-core', severity: 4 });

    const result = listBoundaryDriftDirect(db, { kind: 'boundary_spanning' });

    expect(result.detectedAt).toBe(NEW_RUN);
    expect(result.warnings).toEqual([]);
  });

  it('repoName で絞り込み、他リポの警告を混ぜない', () => {
    insertSpanning(db, { repoId: 2, target: '99', severity: 8 });
    insertSpanning(db, { target: '3', severity: 1.5 });

    const result = listBoundaryDriftDirect(db, { repoName: 'anytime-markdown' });

    expect(result.warnings.map((w) => w.target)).toEqual(['3']);
  });

  it('breakdown を JSON から復元し、kind ごとの指標だけを埋める', () => {
    insertSpanning(db, { target: '3', severity: 1.5 });
    insertFragmentation(db, { target: 'trail-core', severity: 4 });

    const { warnings } = listBoundaryDriftDirect(db);
    const fragmentation = warnings.find((w) => w.kind === 'package_fragmentation');
    const spanning = warnings.find((w) => w.kind === 'boundary_spanning');

    expect(spanning).toMatchObject({ spanCount: 3, dominance: 0.4, communityCount: null });
    expect(spanning?.breakdown).toEqual([
      { key: 'pkg-a', nodeCount: 6 },
      { key: 'pkg-b', nodeCount: 4 },
    ]);
    expect(fragmentation).toMatchObject({ communityCount: 12, spanCount: null, dominance: null });
    // stable_key は boundary_spanning のみ。履歴を跨いだ同一性追跡に使う。
    expect(spanning?.stableKey).toBe('key-3');
    expect(fragmentation?.stableKey).toBe('');
  });

  it('limit で件数を絞る', () => {
    insertSpanning(db, { target: '3', severity: 3 });
    insertSpanning(db, { target: '4', severity: 2 });
    insertSpanning(db, { target: '5', severity: 1 });

    expect(listBoundaryDriftDirect(db, { limit: 2 }).warnings).toHaveLength(2);
  });

  it('空結果の理由を区別する（未解析・未知リポ・テーブル無し）', () => {
    // 解析済みだが警告ゼロ、と、まだ 1 度も検出していないは別物。
    expect(listBoundaryDriftDirect(db)).toMatchObject({ reason: 'no-detection', warnings: [] });

    insertSpanning(db, { target: '3', severity: 1 });
    expect(listBoundaryDriftDirect(db, { repoName: 'unknown' })).toMatchObject({
      reason: 'unknown-repo',
    });

    const bare = new BetterSqlite3(':memory:');
    try {
      expect(listBoundaryDriftDirect(bare)).toMatchObject({ reason: 'no-table', warnings: [] });
    } finally {
      bare.close();
    }
  });
});
