// releases ドメインの query / 解決メソッドのカバレッジ補完。
// resolveReleaseTimes / findMinElapsedMinutes / getReleaseQualityInputs /
// getReleasesInRange / getReleaseFiles / getCoverageByTag を in-memory DB に
// 直接 seed して検証する (git 非依存の純粋 DB ロジックのみ)。

import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = { run: (sql: string, params?: ReadonlyArray<unknown>) => void };
function inner(db: TrailDatabase): SqlJsDb {
  return (db as unknown as { db: SqlJsDb }).db;
}

function insertSession(db: TrailDatabase, id: string): void {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (id, slug, repo_name, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at)
     VALUES (?, ?, 'r', '0', '', '', '', '', 0, '', 0, '')`,
    [id, id],
  );
}

function insertProdReleaseMessage(db: TrailDatabase, uuid: string, sessionId: string, timestamp: string): void {
  insertSession(db, sessionId);
  inner(db).run(
    `INSERT OR IGNORE INTO messages (uuid, session_id, type, timestamp, skill)
     VALUES (?, ?, 'assistant', ?, 'production-release')`,
    [uuid, sessionId, timestamp],
  );
}

function insertRelease(db: TrailDatabase, tag: string, releasedAt: string | null): void {
  inner(db).run(
    `INSERT OR REPLACE INTO releases (tag, released_at, repo_name) VALUES (?, ?, 'repo')`,
    [tag, releasedAt],
  );
}

function insertReleaseFile(
  db: TrailDatabase, tag: string, filePath: string, added: number, deleted: number, changeType: string,
): void {
  inner(db).run(
    `INSERT OR IGNORE INTO release_files (release_tag, file_path, lines_added, lines_deleted, change_type)
     VALUES (?, ?, ?, ?, ?)`,
    [tag, filePath, added, deleted, changeType],
  );
}

function insertReleaseCoverage(
  db: TrailDatabase, tag: string, pkg: string, filePath: string, linesPct: number,
): void {
  inner(db).run(
    `INSERT OR IGNORE INTO release_coverage (release_tag, package, file_path, lines_total, lines_covered, lines_pct)
     VALUES (?, ?, ?, 100, ?, ?)`,
    [tag, pkg, filePath, Math.round(linesPct), linesPct],
  );
}

function insertSessionCommit(
  db: TrailDatabase, sessionId: string, hash: string, message: string, committedAt: string,
): void {
  insertSession(db, sessionId);
  inner(db).run(
    `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, commit_message, committed_at)
     VALUES (?, ?, ?, ?)`,
    [sessionId, hash, message, committedAt],
  );
}

function insertCommitFile(db: TrailDatabase, hash: string, filePath: string): void {
  inner(db).run(
    `INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`,
    [hash, filePath],
  );
}

type SqlJsExec = { exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }> };
function releaseTimeMin(db: TrailDatabase, tag: string): number | null {
  const res = (db as unknown as { db: SqlJsExec }).db
    .exec('SELECT release_time_min FROM releases WHERE tag = ?', [tag]);
  const v = res[0]?.values?.[0]?.[0];
  return v == null ? null : Number(v);
}

describe('TrailDatabase.resolveReleaseTimes', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });

  it('returns 0 when there are no production-release sessions', () => {
    insertRelease(db, 'v1.0.0', '2026-05-20T10:00:00.000Z');
    expect(db.resolveReleaseTimes()).toBe(0);
  });

  it('returns 0 when there are no releases needing resolution', () => {
    insertProdReleaseMessage(db, 'm1', 's1', '2026-05-20T10:00:00.000Z');
    // no releases at all
    expect(db.resolveReleaseTimes()).toBe(0);
  });

  it('sets release_time_min for releases within 720 min after a session start, picking the minimum', () => {
    // Session A starts 10:00, Session B starts 09:00
    insertProdReleaseMessage(db, 'mA', 'sA', '2026-05-20T10:00:00.000Z');
    insertProdReleaseMessage(db, 'mB', 'sB', '2026-05-20T09:00:00.000Z');

    // v1: 10:30 → A=30min, B=90min → min 30
    insertRelease(db, 'v1.0.0', '2026-05-20T10:30:00.000Z');
    // v2: 08:00 → before both sessions → no match (relMs < startMs)
    insertRelease(db, 'v2.0.0', '2026-05-20T08:00:00.000Z');
    // v3: next day 23:00 → > 720 min after both → no match
    insertRelease(db, 'v3.0.0', '2026-05-21T23:00:00.000Z');

    const updated = db.resolveReleaseTimes();
    expect(updated).toBe(1);
    expect(releaseTimeMin(db, 'v1.0.0')).toBeCloseTo(30, 1);
    expect(releaseTimeMin(db, 'v2.0.0')).toBeNull();
    expect(releaseTimeMin(db, 'v3.0.0')).toBeNull();
  });

  it('is idempotent: already-resolved releases are skipped on a second run', () => {
    insertProdReleaseMessage(db, 'mA', 'sA', '2026-05-20T10:00:00.000Z');
    insertRelease(db, 'v1.0.0', '2026-05-20T10:15:00.000Z');
    expect(db.resolveReleaseTimes()).toBe(1);
    // second run: release_time_min already set → query filters it out → 0
    expect(db.resolveReleaseTimes()).toBe(0);
  });
});

describe('TrailDatabase.getReleaseQualityInputs', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });

  it('returns empty arrays when no releases fall in the range', () => {
    const out = db.getReleaseQualityInputs('2026-05-01T00:00:00.000Z', '2026-05-02T00:00:00.000Z');
    expect(out).toEqual({ releases: [], commits: [] });
  });

  it('returns releases and commits (with files) and uses the first line of the commit message as subject', () => {
    insertRelease(db, 'v1.0.0', '2026-05-20T12:00:00.000Z');
    insertSessionCommit(db, 's1', 'abc123', 'feat: add thing\n\nbody line', '2026-05-20T11:00:00.000Z');
    insertCommitFile(db, 'abc123', 'packages/foo/src/a.ts');
    insertCommitFile(db, 'abc123', 'packages/foo/src/b.ts');

    const out = db.getReleaseQualityInputs('2026-05-20T00:00:00.000Z', '2026-05-20T23:59:59.000Z');
    expect(out.releases).toEqual([{ tag_date: '2026-05-20T12:00:00.000Z' }]);
    expect(out.commits).toHaveLength(1);
    expect(out.commits[0].hash).toBe('abc123');
    expect(out.commits[0].subject).toBe('feat: add thing');
    expect(out.commits[0].files.sort()).toEqual([
      'packages/foo/src/a.ts',
      'packages/foo/src/b.ts',
    ]);
  });

  it('includes post-release commits within the 168h fix window', () => {
    insertRelease(db, 'v1.0.0', '2026-05-20T00:00:00.000Z');
    // commit 100h after `to` but within the 168h extension
    insertSessionCommit(db, 's1', 'fixhash', 'fix: post-deploy', '2026-05-24T04:00:00.000Z');

    const out = db.getReleaseQualityInputs('2026-05-20T00:00:00.000Z', '2026-05-20T12:00:00.000Z');
    expect(out.commits.map((c) => c.hash)).toContain('fixhash');
  });
});

describe('TrailDatabase release row getters', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });

  it('getReleasesInRange returns only releases inside the window', () => {
    insertRelease(db, 'v1.0.0', '2026-05-19T00:00:00.000Z');
    insertRelease(db, 'v2.0.0', '2026-05-20T00:00:00.000Z');
    insertRelease(db, 'v3.0.0', '2026-05-25T00:00:00.000Z');

    const rows = db.getReleasesInRange('2026-05-20T00:00:00.000Z', '2026-05-21T00:00:00.000Z');
    expect(rows.map((r) => r.tag)).toEqual(['v2.0.0']);
  });

  it('getReleaseFiles returns [] when none and the rows when present', () => {
    expect(db.getReleaseFiles('v1.0.0')).toEqual([]);
    insertRelease(db, 'v1.0.0', '2026-05-20T00:00:00.000Z');
    insertReleaseFile(db, 'v1.0.0', 'src/a.ts', 10, 2, 'modified');
    const files = db.getReleaseFiles('v1.0.0');
    expect(files).toHaveLength(1);
    expect(files[0].file_path).toBe('src/a.ts');
    expect(files[0].lines_added).toBe(10);
  });

  it('getCoverageByTag returns [] when none and the rows when present', () => {
    expect(db.getCoverageByTag('v1.0.0')).toEqual([]);
    insertRelease(db, 'v1.0.0', '2026-05-20T00:00:00.000Z');
    insertReleaseCoverage(db, 'v1.0.0', 'foo', 'src/a.ts', 85.5);
    const rows = db.getCoverageByTag('v1.0.0');
    expect(rows).toHaveLength(1);
    expect(rows[0].package).toBe('foo');
    expect(rows[0].lines_pct).toBeCloseTo(85.5, 1);
  });
});
