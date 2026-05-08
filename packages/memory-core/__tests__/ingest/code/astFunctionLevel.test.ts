import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { runMigrations } from '../../../src/db/migrations/runner';
import { ingestAstFacts } from '../../../src/ingest/code/astFunctionLevel';
import { entityId } from '../../../src/canonical/entityId';
import { canonicalize } from '../../../src/canonical/canonicalize';
import type { MemoryLogger } from '../../../src/logger';

// ── Types mirrored from TrailGraph ───────────────────────────────────────────

interface TrailNode {
  readonly id: string;
  readonly label: string;
  readonly type: 'file' | 'class' | 'interface' | 'function' | 'variable' | 'type' | 'enum' | 'namespace';
  readonly filePath: string;
  readonly line: number;
  readonly parent?: string;
}

interface TrailEdge {
  readonly source: string;
  readonly target: string;
  readonly type: 'import' | 'call' | 'type_use' | 'inheritance' | 'implementation' | 'override';
}

interface TrailGraph {
  readonly nodes: readonly TrailNode[];
  readonly edges: readonly TrailEdge[];
  readonly metadata: { readonly projectRoot: string; readonly analyzedAt: string; readonly fileCount: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const RECORDED_AT = '2026-01-01T00:00:00.000Z';
const COMMIT_SHA = 'abc123def456';
const REPO = 'test-repo';

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function countFacts(db: Database): number {
  const result = db.exec(`SELECT COUNT(*) FROM memory_code_facts`);
  return result[0]?.values[0][0] as number;
}

function countEdges(db: Database): number {
  const result = db.exec(`SELECT COUNT(*) FROM memory_edges`);
  return result[0]?.values[0][0] as number;
}

function countEntities(db: Database, type: string): number {
  const stmt = db.prepare(`SELECT COUNT(*) FROM memory_entities WHERE type = ?`);
  stmt.bind([type]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return (row['COUNT(*)'] as number) ?? 0;
}

function makeFileNode(filePath: string, line = 1): TrailNode {
  return { id: filePath, label: filePath, type: 'file', filePath, line };
}

function makeFunctionNode(id: string, filePath: string, line = 5): TrailNode {
  return { id, label: id, type: 'function', filePath, line };
}

function makeGraph(nodes: TrailNode[], edges: TrailEdge[]): TrailGraph {
  return {
    nodes,
    edges,
    metadata: { projectRoot: '/test', analyzedAt: RECORDED_AT, fileCount: nodes.filter(n => n.type === 'file').length },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ingestAstFacts', () => {
  // ── AFL-1: external import → Library entity + depends_on edge ────────────
  test('AFL-1: external import edge → Library entity + depends_on edge + fact', async () => {
    const db = await makeDb();
    const srcFile = 'src/foo.ts';
    const graph = makeGraph(
      [makeFileNode(srcFile)],
      [{ source: srcFile, target: 'react', type: 'import' }]
    );

    const stats = ingestAstFacts({
      db,
      repoName: REPO,
      graph,
      commitSha: COMMIT_SHA,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.facts_inserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);

    // fact check
    const factRows = db.exec(`SELECT fact_type, fact_value, file_path FROM memory_code_facts`);
    expect(factRows[0]?.values).toHaveLength(1);
    const [factType, factValue, filePath] = factRows[0].values[0];
    expect(factType).toBe('imports');
    expect(factValue).toBe('react');
    expect(filePath).toBe(srcFile);

    // entity checks
    expect(countEntities(db, 'Library')).toBe(1);
    expect(countEntities(db, 'File')).toBe(1);

    // edge predicate check
    const edgeRows = db.exec(`SELECT predicate, confidence_label FROM memory_edges`);
    expect(edgeRows[0]?.values).toHaveLength(1);
    expect(edgeRows[0].values[0][0]).toBe('depends_on');
    expect(edgeRows[0].values[0][1]).toBe('EXTRACTED');

    db.close();
  }, 30000);

  // ── AFL-2: internal import → File entity + relates_to edge ──────────────
  test('AFL-2: internal import edge → File entity + relates_to edge + fact', async () => {
    const db = await makeDb();
    const srcFile = 'src/foo.ts';
    const targetFile = 'src/bar.ts';
    const graph = makeGraph(
      [makeFileNode(srcFile), makeFileNode(targetFile)],
      [{ source: srcFile, target: targetFile, type: 'import' }]
    );

    const stats = ingestAstFacts({
      db,
      repoName: REPO,
      graph,
      commitSha: COMMIT_SHA,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.facts_inserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);

    expect(countEntities(db, 'File')).toBe(2);
    expect(countEntities(db, 'Library')).toBe(0);

    const edgeRows = db.exec(`SELECT predicate FROM memory_edges`);
    expect(edgeRows[0].values[0][0]).toBe('relates_to');

    db.close();
  }, 30000);

  // ── AFL-3: call edge → relates_to edge + calls fact ─────────────────────
  test('AFL-3: call edge → calls fact + relates_to edge', async () => {
    const db = await makeDb();
    const srcFile = 'src/foo.ts';
    const targetFile = 'src/bar.ts';
    const callerFn = makeFunctionNode(`${srcFile}#greet`, srcFile, 10);
    const calleeFn = makeFunctionNode(`${targetFile}#helper`, targetFile, 3);
    const graph = makeGraph(
      [makeFileNode(srcFile), makeFileNode(targetFile), callerFn, calleeFn],
      [{ source: callerFn.id, target: calleeFn.id, type: 'call' }]
    );

    const stats = ingestAstFacts({
      db,
      repoName: REPO,
      graph,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.facts_inserted).toBe(1);

    const factRows = db.exec(`SELECT fact_type, fact_value, symbol_path, file_path FROM memory_code_facts`);
    expect(factRows[0]?.values).toHaveLength(1);
    const [ft, fv, sp, fp] = factRows[0].values[0];
    expect(ft).toBe('calls');
    expect(fv).toBe(calleeFn.id);
    expect(sp).toBe(callerFn.id);
    expect(fp).toBe(srcFile);

    db.close();
  }, 30000);

  // ── AFL-4: inheritance edge → extends fact + relates_to edge ─────────────
  test('AFL-4: inheritance edge → extends fact + relates_to edge', async () => {
    const db = await makeDb();
    const srcFile = 'src/child.ts';
    const targetFile = 'src/parent.ts';
    const childClass: TrailNode = { id: `${srcFile}#Child`, label: 'Child', type: 'class', filePath: srcFile, line: 1 };
    const parentClass: TrailNode = { id: `${targetFile}#Parent`, label: 'Parent', type: 'class', filePath: targetFile, line: 1 };
    const graph = makeGraph(
      [makeFileNode(srcFile), makeFileNode(targetFile), childClass, parentClass],
      [{ source: childClass.id, target: parentClass.id, type: 'inheritance' }]
    );

    const stats = ingestAstFacts({
      db,
      repoName: REPO,
      graph,
      commitSha: COMMIT_SHA,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.facts_inserted).toBe(1);

    const factRows = db.exec(`SELECT fact_type FROM memory_code_facts`);
    expect(factRows[0].values[0][0]).toBe('extends');

    const edgeRows = db.exec(`SELECT predicate FROM memory_edges`);
    expect(edgeRows[0].values[0][0]).toBe('relates_to');

    db.close();
  }, 30000);

  // ── AFL-5: skip type_use, implementation, override ───────────────────────
  test('AFL-5: type_use, implementation, override edges are skipped', async () => {
    const db = await makeDb();
    const srcFile = 'src/foo.ts';
    const targetFile = 'src/bar.ts';
    const graph = makeGraph(
      [makeFileNode(srcFile), makeFileNode(targetFile)],
      [
        { source: srcFile, target: targetFile, type: 'type_use' },
        { source: srcFile, target: targetFile, type: 'implementation' },
        { source: srcFile, target: targetFile, type: 'override' },
      ]
    );

    const stats = ingestAstFacts({
      db,
      repoName: REPO,
      graph,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.facts_inserted).toBe(0);
    expect(stats.edges_inserted).toBe(0);
    expect(countFacts(db)).toBe(0);
    expect(countEdges(db)).toBe(0);

    db.close();
  }, 30000);

  // ── AFL-6: idempotency — same graph ingested twice → no duplicate facts ──
  test('AFL-6: running twice with same graph → facts and edges unchanged', async () => {
    const db = await makeDb();
    const srcFile = 'src/foo.ts';
    const graph = makeGraph(
      [makeFileNode(srcFile)],
      [{ source: srcFile, target: 'lodash', type: 'import' }]
    );

    ingestAstFacts({
      db, repoName: REPO, graph, commitSha: COMMIT_SHA,
      recordedAt: RECORDED_AT, logger: silentLogger,
    });

    const factsAfterFirst = countFacts(db);
    const edgesAfterFirst = countEdges(db);

    ingestAstFacts({
      db, repoName: REPO, graph, commitSha: COMMIT_SHA,
      recordedAt: RECORDED_AT, logger: silentLogger,
    });

    expect(countFacts(db)).toBe(factsAfterFirst);
    expect(countEdges(db)).toBe(edgesAfterFirst);

    db.close();
  }, 30000);

  // ── AFL-7: empty graph → zero facts and edges ────────────────────────────
  test('AFL-7: empty graph → no facts, no edges', async () => {
    const db = await makeDb();
    const graph = makeGraph([], []);

    const stats = ingestAstFacts({
      db, repoName: REPO, graph, commitSha: null,
      recordedAt: RECORDED_AT, logger: silentLogger,
    });

    expect(stats.facts_inserted).toBe(0);
    expect(stats.edges_inserted).toBe(0);

    db.close();
  }, 30000);

  // ── AFL-8: entity IDs are deterministic (File) ───────────────────────────
  test('AFL-8: File entity ID matches entityId("File", canonicalize(filePath))', async () => {
    const db = await makeDb();
    const srcFile = 'src/foo.ts';
    const graph = makeGraph(
      [makeFileNode(srcFile)],
      [{ source: srcFile, target: 'react', type: 'import' }]
    );

    ingestAstFacts({
      db, repoName: REPO, graph, commitSha: null,
      recordedAt: RECORDED_AT, logger: silentLogger,
    });

    const expectedId = entityId('File', canonicalize(srcFile));
    const stmt = db.prepare(
      `SELECT id FROM memory_entities WHERE type = 'File' AND canonical_name = ?`
    );
    stmt.bind([canonicalize(srcFile)]);
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    expect(row['id']).toBe(expectedId);

    db.close();
  }, 30000);

  // ── AFL-9: Library entity ID is deterministic ────────────────────────────
  test('AFL-9: Library entity ID matches entityId("Library", canonicalize(module))', async () => {
    const db = await makeDb();
    const srcFile = 'src/foo.ts';
    const graph = makeGraph(
      [makeFileNode(srcFile)],
      [{ source: srcFile, target: 'zod', type: 'import' }]
    );

    ingestAstFacts({
      db, repoName: REPO, graph, commitSha: null,
      recordedAt: RECORDED_AT, logger: silentLogger,
    });

    const expectedId = entityId('Library', canonicalize('zod'));
    const stmt = db.prepare(
      `SELECT id FROM memory_entities WHERE type = 'Library' AND canonical_name = ?`
    );
    stmt.bind([canonicalize('zod')]);
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    expect(row['id']).toBe(expectedId);

    db.close();
  }, 30000);

  // ── AFL-10: commit_sha is persisted in fact row ──────────────────────────
  test('AFL-10: commit_sha is stored in memory_code_facts', async () => {
    const db = await makeDb();
    const srcFile = 'src/foo.ts';
    const sha = 'deadbeef1234';
    const graph = makeGraph(
      [makeFileNode(srcFile)],
      [{ source: srcFile, target: 'axios', type: 'import' }]
    );

    ingestAstFacts({
      db, repoName: REPO, graph, commitSha: sha,
      recordedAt: RECORDED_AT, logger: silentLogger,
    });

    const factRows = db.exec(`SELECT commit_sha FROM memory_code_facts`);
    expect(factRows[0]?.values[0][0]).toBe(sha);

    db.close();
  }, 30000);

  // ── AFL-11: multiple edges of different types ────────────────────────────
  test('AFL-11: multiple different edge types → correct fact_types', async () => {
    const db = await makeDb();
    const srcFile = 'src/foo.ts';
    const targetFile = 'src/bar.ts';
    const fn1: TrailNode = { id: `${srcFile}#greet`, label: 'greet', type: 'function', filePath: srcFile, line: 5 };
    const fn2: TrailNode = { id: `${targetFile}#helper`, label: 'helper', type: 'function', filePath: targetFile, line: 2 };

    const graph = makeGraph(
      [makeFileNode(srcFile), makeFileNode(targetFile), fn1, fn2],
      [
        { source: srcFile, target: 'react', type: 'import' },        // external import
        { source: srcFile, target: targetFile, type: 'import' },      // internal import
        { source: fn1.id, target: fn2.id, type: 'call' },            // call
      ]
    );

    const stats = ingestAstFacts({
      db, repoName: REPO, graph, commitSha: null,
      recordedAt: RECORDED_AT, logger: silentLogger,
    });

    expect(stats.facts_inserted).toBe(3);
    expect(countFacts(db)).toBe(3);

    const factRows = db.exec(`SELECT fact_type FROM memory_code_facts ORDER BY fact_type`);
    const types = factRows[0].values.map(r => r[0] as string).sort();
    expect(types).toEqual(['calls', 'imports', 'imports']);

    db.close();
  }, 30000);

  // ── AFL-12: source_type = 'code', confidence_label = 'EXTRACTED' ─────────
  test('AFL-12: edges have source_type="code" and confidence_label="EXTRACTED"', async () => {
    const db = await makeDb();
    const srcFile = 'src/foo.ts';
    const graph = makeGraph(
      [makeFileNode(srcFile)],
      [{ source: srcFile, target: 'express', type: 'import' }]
    );

    ingestAstFacts({
      db, repoName: REPO, graph, commitSha: null,
      recordedAt: RECORDED_AT, logger: silentLogger,
    });

    const edgeRows = db.exec(
      `SELECT source_type, confidence_label, confidence FROM memory_edges`
    );
    expect(edgeRows[0]?.values).toHaveLength(1);
    const [sourceType, confidenceLabel, confidence] = edgeRows[0].values[0];
    expect(sourceType).toBe('code');
    expect(confidenceLabel).toBe('EXTRACTED');
    expect(confidence).toBe(1.0);

    db.close();
  }, 30000);
});
