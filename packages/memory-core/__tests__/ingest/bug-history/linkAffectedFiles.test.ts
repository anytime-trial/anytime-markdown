import { BetterSqlite3MemoryDb } from '../../../src/db/connection/BetterSqlite3MemoryDb';
import { linkAffectedFiles } from '../../../src/ingest/bug-history/linkAffectedFiles';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { entityId } from '../../../src/canonical/entityId';
import { noopLogger } from '../../../src/logger';
import { openMemoryCoreDb } from '../../../src/db/connection';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

function makeTmpPath(suffix = '') {
  return path.join(os.tmpdir(), `laf-test-${process.pid}-${Date.now()}${suffix}.db`);
}

async function buildTestDb(commitSha: string, filePaths: string[], repoName = 'anytime-markdown') {
  const tmpPath = makeTmpPath();

  // 1. Open memory-core DB
  const { db, close: closeMain } = await openMemoryCoreDb(tmpPath);

  // 2. Build trail DB in-memory using sql.js and attach via handle
  // Phase H-4: trail.commit_files から repo_name 列を撤去した。repo 帰属は repo_id で表現し、
  // linkAffectedFiles は trail.repos を JOIN して repo_name → repo_id を解決する。
  const trailHandle = BetterSqlite3MemoryDb.openInMemory();
  trailHandle.run('PRAGMA foreign_keys = ON');
  trailHandle.run(`CREATE TABLE repos (
    repo_id INTEGER PRIMARY KEY,
    repo_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  ) STRICT`);
  trailHandle.run(
    `INSERT INTO repos (repo_name, created_at) VALUES (?, '2026-01-01T00:00:00.000Z')`,
    [repoName]
  );
  const repoIdRow = trailHandle.exec('SELECT repo_id FROM repos WHERE repo_name = ?', [repoName]);
  const repoId = Number(repoIdRow[0]?.values?.[0]?.[0] ?? 0);
  trailHandle.run(`CREATE TABLE commit_files (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    repo_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL DEFAULT 'M'
  ) STRICT`);
  for (const fp of filePaths) {
    trailHandle.run(
      `INSERT INTO commit_files (commit_hash, repo_id, file_path) VALUES (?, ?, ?)`,
      [commitSha, repoId, fp]
    );
  }

  attachTrailDbFromHandle(db, trailHandle);

  // 3. Insert a Bug entity
  const bugId = entityId('Bug', commitSha);
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Bug', ?, 'test bug', '[]', '[]', '{}',
             '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    [bugId, commitSha]
  );

  return {
    db,
    bugId,
    repoName,
    close: () => {
      trailHandle.close();
      closeMain();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    },
  };
}

describe('linkAffectedFiles', () => {
  test('3 files in commit_files → 3 edges_inserted', async () => {
    const filePaths = [
      'packages/web-app/src/foo.ts',
      'packages/web-app/src/bar.ts',
      'packages/trail-viewer/src/baz.ts',
    ];
    const { db, bugId, repoName, close } = await buildTestDb('sha001', filePaths);

    const result = linkAffectedFiles({
      db,
      bugEntityId: bugId,
      commitSha: 'sha001',
      repoName,
      recordedAt: '2026-01-01T00:00:00.000Z',
      valid_from: '2026-01-01T00:00:00.000Z',
      logger: noopLogger,
    });

    expect(result.file_paths).toHaveLength(3);
    expect(result.edges_inserted).toBe(3);

    const edgeCount = db.exec(
      `SELECT COUNT(*) FROM memory_edges WHERE predicate='affects' AND subject_entity_id=?`,
      [bugId]
    );
    expect(edgeCount[0].values[0][0]).toBe(3);

    close();
  }, 30000);

  test('calling twice → second call returns edges_inserted=0 (INSERT OR IGNORE)', async () => {
    const filePaths = ['packages/web-app/src/foo.ts'];
    const { db, bugId, repoName, close } = await buildTestDb('sha002', filePaths);

    const args = {
      db,
      bugEntityId: bugId,
      commitSha: 'sha002',
      repoName,
      recordedAt: '2026-01-01T00:00:00.000Z',
      valid_from: '2026-01-01T00:00:00.000Z',
      logger: noopLogger,
    };

    linkAffectedFiles(args);
    const second = linkAffectedFiles(args);
    expect(second.edges_inserted).toBe(0);

    close();
  }, 30000);

  test('repoName mismatch → no files extracted', async () => {
    const filePaths = ['packages/web-app/src/foo.ts'];
    const { db, bugId, close } = await buildTestDb('sha003', filePaths);

    const result = linkAffectedFiles({
      db,
      bugEntityId: bugId,
      commitSha: 'sha003',
      repoName: 'different-repo',
      recordedAt: '2026-01-01T00:00:00.000Z',
      valid_from: '2026-01-01T00:00:00.000Z',
      logger: noopLogger,
    });

    expect(result.file_paths).toHaveLength(0);
    expect(result.edges_inserted).toBe(0);

    close();
  }, 30000);
});
