import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { runMigrations } from '../../../src/db/migrations/runner';
import { extractDecisionComments } from '../../../src/ingest/code/extractComments';
import { entityId } from '../../../src/canonical/entityId';
import { createHash } from 'crypto';
import type { MemoryLogger } from '../../../src/logger';

// ── Constants ────────────────────────────────────────────────────────────────

const RECORDED_AT = '2026-01-01T00:00:00.000Z';
const REPO = 'test-repo';

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

/**
 * Write source content to a temp file, create a ts.Program for it, and
 * return both the program and the absolute file path.
 */
function makeProgramFromSource(
  source: string,
  filename = 'test-fixture.ts'
): { program: ts.Program; filePath: string; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-core-test-'));
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, source, 'utf-8');

  const program = ts.createProgram([filePath], {
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
  });

  return { program, filePath, tmpDir };
}

function cleanupTmp(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

function countDecisions(db: Database): number {
  const result = db.exec(`SELECT COUNT(*) FROM memory_entities WHERE type = 'Decision'`);
  return result[0]?.values[0][0] as number ?? 0;
}

function countEdges(db: Database, predicate?: string): number {
  if (predicate) {
    const stmt = db.prepare(`SELECT COUNT(*) FROM memory_edges WHERE predicate = ?`);
    stmt.bind([predicate]);
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return (row['COUNT(*)'] as number) ?? 0;
  }
  const result = db.exec(`SELECT COUNT(*) FROM memory_edges`);
  return result[0]?.values[0][0] as number ?? 0;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('extractDecisionComments', () => {
  // EC-1: single-line // WHY: comment
  test('EC-1: // WHY: comment → 1 Decision entity + 1 rationale_for edge', async () => {
    const db = await makeDb();
    const source = `
// WHY: ロジック A の理由
export function myFunc() {
  return 42;
}
`;
    const { program, filePath, tmpDir } = makeProgramFromSource(source);

    const stats = extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.decisions_inserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);

    expect(countDecisions(db)).toBe(1);
    expect(countEdges(db, 'rationale_for')).toBe(1);

    // Verify the Decision entity summary
    const rows = db.exec(`SELECT summary, display_name FROM memory_entities WHERE type = 'Decision'`);
    expect(rows[0]?.values).toHaveLength(1);
    const [summary, displayName] = rows[0].values[0];
    expect((summary as string)).toContain('ロジック A の理由');
    expect((displayName as string)).toContain('ロジック A の理由');

    // Verify edge source_ref
    const edgeRows = db.exec(`SELECT source_ref, source_type, confidence_label FROM memory_edges`);
    expect(edgeRows[0]?.values).toHaveLength(1);
    const [sourceRef, sourceType, confidenceLabel] = edgeRows[0].values[0];
    expect(sourceRef as string).toMatch(/^code_fact:comment:.+#\d+$/);
    expect(sourceType).toBe('code');
    expect(confidenceLabel).toBe('EXTRACTED');

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-2: block comment /* WHY: ... */
  test('EC-2: /* WHY: multi-line */ → 1 Decision + 1 edge', async () => {
    const db = await makeDb();
    const source = `
/* WHY: This design decision was made
   to improve performance */
export class MyClass {}
`;
    const { program, filePath, tmpDir } = makeProgramFromSource(source);

    const stats = extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.decisions_inserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);

    const rows = db.exec(`SELECT summary FROM memory_entities WHERE type = 'Decision'`);
    const summary = rows[0]?.values[0][0] as string;
    expect(summary).toContain('This design decision was made');

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-3: case-insensitive matching
  test('EC-3: // why:, // Why:, // RATIONALE: all match', async () => {
    const db = await makeDb();
    const source = `
// why: lowercase why comment
export const a = 1;

// Why: mixed case why
export const b = 2;

// RATIONALE: uppercase rationale
export const c = 3;
`;
    const { program, tmpDir } = makeProgramFromSource(source);

    const stats = extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.decisions_inserted).toBe(3);
    expect(stats.edges_inserted).toBe(3);
    expect(countDecisions(db)).toBe(3);

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-4: Japanese 理由: pattern
  test('EC-4: // 理由: Japanese comment → Decision entity', async () => {
    const db = await makeDb();
    const source = `
// 理由: パフォーマンス向上のため
export function compute() {}
`;
    const { program, tmpDir } = makeProgramFromSource(source);

    const stats = extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.decisions_inserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);

    const rows = db.exec(`SELECT summary FROM memory_entities WHERE type = 'Decision'`);
    expect((rows[0]?.values[0][0] as string)).toContain('パフォーマンス向上のため');

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-5: idempotency — running twice produces no duplicates
  test('EC-5: running twice → no duplicate entities or edges', async () => {
    const db = await makeDb();
    const source = `
// WHY: deterministic id test
export function stable() {}
`;
    const { program, tmpDir } = makeProgramFromSource(source);

    const stats1 = extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    const stats2 = extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    // Second run should insert 0 (already exists)
    expect(stats2.decisions_inserted).toBe(0);
    expect(stats2.edges_inserted).toBe(0);

    // Total should still be 1
    expect(countDecisions(db)).toBe(1);
    expect(countEdges(db, 'rationale_for')).toBe(1);

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-6: non-WHY comments are not extracted
  test('EC-6: regular comments without WHY/RATIONALE/理由 are ignored', async () => {
    const db = await makeDb();
    const source = `
// This is a normal comment
// TODO: fix this later
/** JSDoc comment */
export function regularFunc() {}
`;
    const { program, tmpDir } = makeProgramFromSource(source);

    const stats = extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.decisions_inserted).toBe(0);
    expect(stats.edges_inserted).toBe(0);
    expect(countDecisions(db)).toBe(0);

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-7: Decision entity ID is deterministic (sha1-based)
  test('EC-7: Decision entity ID is deterministic based on file:line:text', async () => {
    const db = await makeDb();
    const source = `
// WHY: specific reason for this choice
export const x = 1;
`;
    const { program, filePath, tmpDir } = makeProgramFromSource(source);

    extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    // The comment is on line 2 (1-indexed), text = "specific reason for this choice"
    // We need to find the actual line number from the DB
    const entityRows = db.exec(`SELECT id, canonical_name FROM memory_entities WHERE type = 'Decision'`);
    expect(entityRows[0]?.values).toHaveLength(1);

    const [storedId, canonName] = entityRows[0].values[0];
    // Verify ID = entityId('Decision', canonName)
    expect(storedId).toBe(entityId('Decision', canonName as string));

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-8: edge source_ref contains file path and line number
  test('EC-8: edge source_ref format is code_fact:comment:<filePath>#<line>', async () => {
    const db = await makeDb();
    const source = `
// WHY: testing source ref format
export function refTest() {}
`;
    const { program, filePath, tmpDir } = makeProgramFromSource(source);

    extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    const edgeRows = db.exec(`SELECT source_ref FROM memory_edges WHERE predicate = 'rationale_for'`);
    expect(edgeRows[0]?.values).toHaveLength(1);
    const sourceRef = edgeRows[0].values[0][0] as string;

    // Format: code_fact:comment:<absolute_path>#<line_number>
    expect(sourceRef).toMatch(/^code_fact:comment:.+#\d+$/);
    expect(sourceRef).toContain(filePath);

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-9: .d.ts files are skipped
  test('EC-9: declaration files (.d.ts) are skipped', async () => {
    const db = await makeDb();
    const source = `
// WHY: this is in a .d.ts file
export declare function declaredFn(): void;
`;
    const { program, tmpDir } = makeProgramFromSource(source, 'test-fixture.d.ts');

    const stats = extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.decisions_inserted).toBe(0);
    expect(countDecisions(db)).toBe(0);

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-10: multiple WHY comments in same file
  test('EC-10: multiple WHY comments in same file → multiple Decision entities', async () => {
    const db = await makeDb();
    const source = `
// WHY: first reason
export function alpha() {}

// RATIONALE: second reason
export function beta() {}

// 理由: third reason
export function gamma() {}
`;
    const { program, tmpDir } = makeProgramFromSource(source);

    const stats = extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.decisions_inserted).toBe(3);
    expect(stats.edges_inserted).toBe(3);
    expect(countDecisions(db)).toBe(3);
    expect(countEdges(db, 'rationale_for')).toBe(3);

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-11: File entity is created as target of rationale_for edge
  test('EC-11: File entity is created and linked as rationale_for target', async () => {
    const db = await makeDb();
    const source = `
// WHY: testing file entity creation
export const val = 42;
`;
    const { program, filePath, tmpDir } = makeProgramFromSource(source);

    extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    // File entity should exist
    const fileRows = db.exec(`SELECT COUNT(*) FROM memory_entities WHERE type = 'File'`);
    expect(fileRows[0]?.values[0][0] as number).toBe(1);

    // Edge connects Decision → File
    const edgeRows = db.exec(`
      SELECT me_subj.type, me_obj.type
      FROM memory_edges e
      JOIN memory_entities me_subj ON me_subj.id = e.subject_entity_id
      JOIN memory_entities me_obj ON me_obj.id = e.object_entity_id
      WHERE e.predicate = 'rationale_for'
    `);
    expect(edgeRows[0]?.values).toHaveLength(1);
    expect(edgeRows[0].values[0][0]).toBe('Decision');
    expect(edgeRows[0].values[0][1]).toBe('File');

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);

  // EC-12: display_name is truncated to 80 chars
  test('EC-12: display_name of Decision is at most 80 chars from comment text', async () => {
    const db = await makeDb();
    const longText = 'A'.repeat(100);
    const source = `
// WHY: ${longText}
export function longReason() {}
`;
    const { program, tmpDir } = makeProgramFromSource(source);

    extractDecisionComments({
      db,
      program,
      repoName: REPO,
      commitSha: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    const rows = db.exec(`SELECT display_name FROM memory_entities WHERE type = 'Decision'`);
    const displayName = rows[0]?.values[0][0] as string;
    // display_name includes potential symbol prefix, but the text portion is ≤ 80 chars
    expect(displayName.length).toBeLessThanOrEqual(90); // symbol + colon + space + 80

    cleanupTmp(tmpDir);
    db.close();
  }, 30000);
});
