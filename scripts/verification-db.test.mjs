import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  VERIFICATION_KINDS,
  resolveVerificationDbPath,
  openVerificationDb,
  recordRun,
  queryVerifiedKinds,
  listRuns,
} from './verification-db.mjs';

let tmpDir;
let savedTrailHome;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifdb-'));
  savedTrailHome = process.env.TRAIL_HOME;
  delete process.env.TRAIL_HOME;
});
afterEach(() => {
  if (savedTrailHome === undefined) delete process.env.TRAIL_HOME;
  else process.env.TRAIL_HOME = savedTrailHome;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const baseRun = {
  kind: 'unit',
  package: 'markdown-viewer',
  command: 'npx jest packages/markdown-viewer',
  status: 'pass',
  durationMs: 1234,
  commitHash: 'abc123',
  treeState: 'clean',
  startedAt: '2026-07-06T00:00:00.000Z',
  finishedAt: '2026-07-06T00:00:01.234Z',
};

test('resolveVerificationDbPath: TRAIL_HOME を優先し db/verification.db を返す', () => {
  process.env.TRAIL_HOME = path.join(tmpDir, 'trail');
  assert.equal(resolveVerificationDbPath(), path.join(tmpDir, 'trail', 'db', 'verification.db'));
});

test('resolveVerificationDbPath: 保護領域 (.claude) を指す TRAIL_HOME は throw', () => {
  process.env.TRAIL_HOME = path.join(os.homedir(), '.claude', 'trail');
  assert.throws(() => resolveVerificationDbPath(), /refusing protected path/);
});

test('openVerificationDb: 二重 open してもマイグレーションは冪等', () => {
  const dbPath = path.join(tmpDir, 'db', 'verification.db');
  openVerificationDb(dbPath).close();
  const db = openVerificationDb(dbPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  assert.ok(tables.some((t) => t.name === 'verification_runs'));
  db.close();
});

test('recordRun: clean は code_state_hash=commit、dirty は NULL', () => {
  const db = openVerificationDb(':memory:');
  recordRun(db, baseRun);
  recordRun(db, { ...baseRun, kind: 'build', treeState: 'dirty' });
  const rows = db.prepare('SELECT kind, code_state_hash FROM verification_runs ORDER BY id').all();
  assert.equal(rows[0].code_state_hash, 'abc123');
  assert.equal(rows[1].code_state_hash, null);
  db.close();
});

test('recordRun: 不正な kind は throw', () => {
  const db = openVerificationDb(':memory:');
  assert.throws(() => recordRun(db, { ...baseRun, kind: 'nosuch' }), /unknown kind/);
  db.close();
});

test('queryVerifiedKinds: pass のみ・kind ごとに最新を返す', () => {
  const db = openVerificationDb(':memory:');
  recordRun(db, { ...baseRun, status: 'fail', startedAt: '2026-07-06T00:00:00.000Z' });
  recordRun(db, { ...baseRun, startedAt: '2026-07-06T01:00:00.000Z' });
  recordRun(db, { ...baseRun, startedAt: '2026-07-06T02:00:00.000Z' });
  recordRun(db, { ...baseRun, kind: 'typecheck', status: 'fail' });
  const verified = queryVerifiedKinds(db, { packageName: 'markdown-viewer', codeStateHash: 'abc123' });
  assert.deepEqual([...verified.keys()], ['unit']);
  assert.equal(verified.get('unit').started_at, '2026-07-06T02:00:00.000Z');
  db.close();
});

test('listRuns: commit / 期間でフィルタする', () => {
  const db = openVerificationDb(':memory:');
  recordRun(db, baseRun);
  recordRun(db, { ...baseRun, commitHash: 'def456', startedAt: '2026-07-07T00:00:00.000Z' });
  assert.equal(listRuns(db, { commitHash: 'abc123' }).length, 1);
  assert.equal(listRuns(db, { sinceIso: '2026-07-07T00:00:00.000Z' }).length, 1);
  assert.equal(listRuns(db).length, 2);
  db.close();
});

test('VERIFICATION_KINDS: RFC の 7 種別', () => {
  assert.deepEqual([...VERIFICATION_KINDS], ['unit', 'build', 'next-build', 'typecheck', 'lint', 'e2e', 'manual']);
});
