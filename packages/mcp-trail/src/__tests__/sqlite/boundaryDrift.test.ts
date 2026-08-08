import BetterSqlite3, { type Database } from 'better-sqlite3';
import {
  CREATE_BOUNDARY_DRIFT_INDEXES,
  CREATE_BOUNDARY_DRIFT_RUNS,
  CREATE_BOUNDARY_DRIFT_WARNINGS,
} from '@anytime-markdown/trail-activity';

import { listBoundaryDriftDirect } from '../../sqlite/boundaryDrift';

const OLD_RUN = '2026-08-01T00:00:00.000Z';
const NEW_RUN = '2026-08-02T00:00:00.000Z';

function createDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(
    `CREATE TABLE repos (repo_id INTEGER PRIMARY KEY, repo_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)`,
  );
  db.exec(CREATE_BOUNDARY_DRIFT_WARNINGS);
  db.exec(CREATE_BOUNDARY_DRIFT_RUNS);
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

/** 検出回を記録する。警告を積む側からも呼ばれ、warning_count を実装と同じ意味に保つ。 */
function insertRun(
  db: Database,
  args: { repoId?: number; detectedAt?: string; warningCount?: number; nodeCount?: number },
): void {
  db.prepare(
    `INSERT INTO boundary_drift_runs (repo_id, detected_at, warning_count, node_count)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(repo_id, detected_at) DO UPDATE SET warning_count = warning_count + excluded.warning_count`,
  ).run(args.repoId ?? 1, args.detectedAt ?? NEW_RUN, args.warningCount ?? 0, args.nodeCount ?? 100);
}

function insertSpanning(
  db: Database,
  args: { repoId?: number; detectedAt?: string; target: string; severity: number; spanCount?: number },
): void {
  insertRun(db, { ...args, warningCount: 1 });
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
  insertRun(db, { ...args, warningCount: 1 });
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
    insertFragmentation(db, { target: 'trail-activity', severity: 4 });

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
    insertFragmentation(db, { target: 'trail-activity', severity: 4 });

    expect(listBoundaryDriftDirect(db, { kind: 'boundary_spanning' }).warnings).toHaveLength(1);
    expect(
      listBoundaryDriftDirect(db, { kind: 'package_fragmentation', minSeverity: 2 }).warnings.map(
        (w) => w.target,
      ),
    ).toEqual(['trail-activity']);
  });

  it('kind 無しの minSeverity は拒否する（severity は kind 内でのみ比較可能）', () => {
    insertSpanning(db, { target: '3', severity: 1.5 });

    // 尺度が違う 2 種を横断で足切りすると、spanning だけが静かに全滅する。
    expect(() => listBoundaryDriftDirect(db, { minSeverity: 2 })).toThrow(/minSeverity requires kind/);
  });

  it('kind で絞っても最新回の特定は絞り込み前に行う', () => {
    // 最新回には fragmentation しか無い。spanning だけを見たとき、古い回へ遡らないこと。
    insertSpanning(db, { detectedAt: OLD_RUN, target: '3', severity: 9 });
    insertFragmentation(db, { target: 'trail-activity', severity: 4 });

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
    insertFragmentation(db, { target: 'trail-activity', severity: 4 });

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

  it('repo ごとに最新回を取る（解析時刻の新しい repo が古い repo を消さない）', () => {
    // repo1 の最新回は OLD、repo2 の最新回は NEW。全 repo 横断の MAX を採ると repo1 が消える。
    insertSpanning(db, { repoId: 1, detectedAt: OLD_RUN, target: '3', severity: 5 });
    insertSpanning(db, { repoId: 2, detectedAt: NEW_RUN, target: '99', severity: 2 });

    const result = listBoundaryDriftDirect(db);

    expect(result.warnings.map((w) => w.target)).toEqual(['3', '99']);
    // 検出時刻が repo ごとに違うので単一の detectedAt は名乗らない。runs で明示する。
    expect(result.detectedAt).toBeNull();
    expect(result.runs.map((r) => [r.repoName, r.detectedAt])).toEqual([
      ['other-repo', NEW_RUN],
      ['anytime-markdown', OLD_RUN],
    ]);
  });

  it('警告が解消された回は健全として返る（古い警告が最新に居座らない）', () => {
    insertSpanning(db, { detectedAt: OLD_RUN, target: '3', severity: 9 });
    // 最新回は警告 0 件（＝解消された）。警告行が無いので run だけが積まれる。
    insertRun(db, { detectedAt: NEW_RUN, warningCount: 0 });

    const result = listBoundaryDriftDirect(db);

    expect(result.warnings).toEqual([]);
    expect(result.reason).toBe('no-warnings');
    expect(result.detectedAt).toBe(NEW_RUN);
    expect(result.runs[0]).toMatchObject({ detectedAt: NEW_RUN, warningCount: 0 });
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
