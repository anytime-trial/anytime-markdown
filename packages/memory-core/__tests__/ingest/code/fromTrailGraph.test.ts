import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { runMigrations } from '../../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { fromTrailGraph } from '../../../src/ingest/code/fromTrailGraph';
import { entityId } from '../../../src/canonical/entityId';
import { canonicalize } from '../../../src/canonical/canonicalize';
import type { MemoryLogger } from '../../../src/logger';

// ── Helpers ─────────────────────────────────────────────────────────────────

const RECORDED_AT = '2026-01-01T00:00:00.000Z';

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};

async function makeMemoryDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeTrailDb(
  SQL: Awaited<ReturnType<typeof initSqlJs>>
): Database {
  const trailDb = new SQL.Database();
  trailDb.run(`
    CREATE TABLE current_code_graphs (
      repo_name    TEXT PRIMARY KEY,
      graph_json   TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    ) STRICT
  `);
  return trailDb;
}

interface MockNode {
  id: string;
  label?: string;
  repo?: string;
  package: string;
  fileType: 'code' | 'document';
  community?: number;
  communityLabel?: string;
  x?: number;
  y?: number;
  size?: number;
}

function insertGraph(
  trailDb: Database,
  repoName: string,
  nodes: MockNode[]
): void {
  const fullNodes = nodes.map((n) => ({
    id: n.id,
    label: n.label ?? n.id,
    repo: n.repo ?? repoName,
    package: n.package,
    fileType: n.fileType,
    community: n.community ?? 0,
    communityLabel: n.communityLabel ?? '',
    x: n.x ?? 0,
    y: n.y ?? 0,
    size: n.size ?? 1,
  }));

  const graphJson = JSON.stringify({
    generatedAt: RECORDED_AT,
    repositories: [{ id: repoName, label: repoName, path: `/repos/${repoName}` }],
    nodes: fullNodes,
    edges: [],
    communities: {},
    godNodes: [],
  });

  trailDb.run(
    `INSERT INTO current_code_graphs (repo_name, graph_json, generated_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(repo_name) DO UPDATE SET graph_json = excluded.graph_json`,
    [repoName, graphJson, RECORDED_AT, RECORDED_AT]
  );
}

function countEntities(db: Database, type: string): number {
  // Use prepare/bind/step because exec() with params is broken after
  // installTrailReadonlyGuard wraps db.exec (guard drops the params arg).
  const stmt = db.prepare(`SELECT COUNT(*) FROM memory_entities WHERE type = ?`);
  stmt.bind([type]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return (row['COUNT(*)'] as number) ?? 0;
}

function countEdges(db: Database): number {
  const result = db.exec(`SELECT COUNT(*) FROM memory_edges`);
  return result[0]?.values[0][0] as number;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('fromTrailGraph', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;

  beforeAll(async () => {
    SQL = await initSqlJs();
  });

  // ── FTG-1: basic happy path ──────────────────────────────────────────────
  test('FTG-1: 3 code nodes across 2 packages → 2 Package + 3 File + 3 edges', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertGraph(trailDb, 'my-repo', [
      { id: 'packages/web-app/src/index.ts', package: 'web-app', fileType: 'code' },
      { id: 'packages/web-app/src/App.tsx', package: 'web-app', fileType: 'code' },
      { id: 'packages/api/src/server.ts', package: 'api', fileType: 'code' },
    ]);

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = fromTrailGraph({
      db: memDb,
      repoName: 'my-repo',
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.packages_upserted).toBe(2);
    expect(stats.files_upserted).toBe(3);
    expect(stats.edges_inserted).toBe(3);
    expect(stats.repo_name).toBe('my-repo');

    expect(countEntities(memDb, 'Package')).toBe(2);
    expect(countEntities(memDb, 'File')).toBe(3);
    expect(countEdges(memDb)).toBe(3);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── FTG-2: document nodes are excluded ───────────────────────────────────
  test('FTG-2: document nodes are excluded from Package/File entities', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertGraph(trailDb, 'my-repo', [
      { id: 'packages/web-app/src/index.ts', package: 'web-app', fileType: 'code' },
      { id: 'README.md', package: 'web-app', fileType: 'document' },
      { id: 'docs/guide.md', package: 'docs', fileType: 'document' },
    ]);

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = fromTrailGraph({
      db: memDb,
      repoName: 'my-repo',
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.packages_upserted).toBe(1); // only 'web-app' (docs has no code nodes)
    expect(stats.files_upserted).toBe(1); // only the .ts file
    expect(stats.edges_inserted).toBe(1);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── FTG-3: idempotency — same graph inserted twice ────────────────────────
  test('FTG-3: running twice with same graph_json → entity/edge counts unchanged', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertGraph(trailDb, 'my-repo', [
      { id: 'packages/web-app/src/index.ts', package: 'web-app', fileType: 'code' },
      { id: 'packages/web-app/src/App.tsx', package: 'web-app', fileType: 'code' },
    ]);

    attachTrailDbFromHandle(memDb, trailDb);

    const stats1 = fromTrailGraph({
      db: memDb,
      repoName: 'my-repo',
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    const pkgsBefore = countEntities(memDb, 'Package');
    const filesBefore = countEntities(memDb, 'File');
    const edgesBefore = countEdges(memDb);

    // Run again with identical data
    const stats2 = fromTrailGraph({
      db: memDb,
      repoName: 'my-repo',
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(countEntities(memDb, 'Package')).toBe(pkgsBefore);
    expect(countEntities(memDb, 'File')).toBe(filesBefore);
    expect(countEdges(memDb)).toBe(edgesBefore);

    // Both runs should report the same counts (upsert does not distinguish new vs existing)
    expect(stats1.packages_upserted).toBe(stats2.packages_upserted);
    expect(stats1.files_upserted).toBe(stats2.files_upserted);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── FTG-4: missing repo returns empty stats ───────────────────────────────
  test('FTG-4: repo_name not found → returns zero stats, no DB writes', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    // Insert graph for a different repo
    insertGraph(trailDb, 'other-repo', [
      { id: 'src/index.ts', package: 'my-pkg', fileType: 'code' },
    ]);

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = fromTrailGraph({
      db: memDb,
      repoName: 'nonexistent-repo',
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.packages_upserted).toBe(0);
    expect(stats.files_upserted).toBe(0);
    expect(stats.edges_inserted).toBe(0);

    expect(countEntities(memDb, 'Package')).toBe(0);
    expect(countEntities(memDb, 'File')).toBe(0);
    expect(countEdges(memDb)).toBe(0);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── FTG-5: entity IDs are deterministic ──────────────────────────────────
  test('FTG-5: Package entity ID matches entityId("Package", canonicalize(name))', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertGraph(trailDb, 'my-repo', [
      { id: 'packages/web-app/src/index.ts', package: 'web-app', fileType: 'code' },
    ]);

    attachTrailDbFromHandle(memDb, trailDb);

    fromTrailGraph({
      db: memDb,
      repoName: 'my-repo',
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    const expectedPkgId = entityId('Package', canonicalize('web-app'));
    // Use prepare/bind/step — exec() with params is broken after guard wraps db.exec
    const pkgStmt = memDb.prepare(
      `SELECT id FROM memory_entities WHERE type = 'Package' AND canonical_name = ?`
    );
    pkgStmt.bind([canonicalize('web-app')]);
    pkgStmt.step();
    const pkgRow = pkgStmt.getAsObject();
    pkgStmt.free();
    expect(pkgRow['id']).toBe(expectedPkgId);

    const expectedFileId = entityId('File', canonicalize('packages/web-app/src/index.ts'));
    const fileStmt = memDb.prepare(
      `SELECT id FROM memory_entities WHERE type = 'File' AND canonical_name = ?`
    );
    fileStmt.bind([canonicalize('packages/web-app/src/index.ts')]);
    fileStmt.step();
    const fileRow = fileStmt.getAsObject();
    fileStmt.free();
    expect(fileRow['id']).toBe(expectedFileId);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── FTG-6: edge source_type = 'code' ─────────────────────────────────────
  test('FTG-6: edges have source_type = "code" and source_ref = repo_name', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertGraph(trailDb, 'my-repo', [
      { id: 'src/index.ts', package: 'my-pkg', fileType: 'code' },
    ]);

    attachTrailDbFromHandle(memDb, trailDb);

    fromTrailGraph({
      db: memDb,
      repoName: 'my-repo',
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    const edgeRows = memDb.exec(
      `SELECT source_type, source_ref, predicate FROM memory_edges`
    );
    expect(edgeRows[0]?.values).toHaveLength(1);
    const [sourceType, sourceRef, predicate] = edgeRows[0].values[0];
    expect(sourceType).toBe('code');
    expect(sourceRef).toBe('my-repo');
    expect(predicate).toBe('relates_to');

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── FTG-7: all-document graph → zero entities ────────────────────────────
  test('FTG-7: graph with only document nodes → zero entities and edges', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertGraph(trailDb, 'docs-repo', [
      { id: 'docs/guide.md', package: 'docs', fileType: 'document' },
      { id: 'README.md', package: 'root', fileType: 'document' },
    ]);

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = fromTrailGraph({
      db: memDb,
      repoName: 'docs-repo',
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.packages_upserted).toBe(0);
    expect(stats.files_upserted).toBe(0);
    expect(stats.edges_inserted).toBe(0);

    expect(countEntities(memDb, 'Package')).toBe(0);
    expect(countEntities(memDb, 'File')).toBe(0);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── FTG-8: multiple repos stored, only target repo is processed ───────────
  test('FTG-8: multiple repos in trail — only the requested repo is processed', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertGraph(trailDb, 'repo-a', [
      { id: 'src/a.ts', package: 'pkg-a', fileType: 'code' },
    ]);
    insertGraph(trailDb, 'repo-b', [
      { id: 'src/b.ts', package: 'pkg-b', fileType: 'code' },
      { id: 'src/c.ts', package: 'pkg-b', fileType: 'code' },
    ]);

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = fromTrailGraph({
      db: memDb,
      repoName: 'repo-a',
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.packages_upserted).toBe(1);
    expect(stats.files_upserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);

    // Only pkg-a entities should exist
    expect(countEntities(memDb, 'Package')).toBe(1);
    expect(countEntities(memDb, 'File')).toBe(1);

    const pkgRows = memDb.exec(`SELECT canonical_name FROM memory_entities WHERE type = 'Package'`);
    expect(pkgRows[0]?.values[0][0]).toBe(canonicalize('pkg-a'));

    trailDb.close();
    memDb.close();
  }, 30000);
});
