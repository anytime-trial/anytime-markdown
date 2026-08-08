import { test, beforeEach, afterEach } from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  VERIFICATION_KINDS,
  resolveTrailDbPath,
  openVerificationLedger,
  SCHEMA_STATEMENTS,
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
  package: 'markdown-editor',
  command: 'npx jest packages/markdown-editor',
  status: 'pass',
  durationMs: 1234,
  commitHash: 'abc123',
  treeState: 'clean',
  startedAt: '2026-07-06T00:00:00.000Z',
  finishedAt: '2026-07-06T00:00:01.234Z',
};

test('resolveTrailDbPath: TRAIL_HOME を優先し db/trail.db を返す（指示と同じ DB ファイル）', () => {
  process.env.TRAIL_HOME = path.join(tmpDir, 'trail');
  assert.equal(resolveTrailDbPath(), path.join(tmpDir, 'trail', 'db', 'trail.db'));
});

// 回帰: worktree から検証を回したとき、worktree 側に空の trail.db を作らせない。
// 指示台帳は本体の trail.db にしかないため、書き先が分かれると 1 件も紐づかない。
test('resolveTrailDbPath: worktree からでも本体（git common dir の親）の trail.db を返す', () => {
  const repo = path.join(tmpDir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git(['init', '-q', '-b', 'main'], repo);
  git(['config', 'user.email', 't@example.com'], repo);
  git(['config', 'user.name', 'tester'], repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
  git(['add', 'a.txt'], repo);
  git(['commit', '-qm', 'init'], repo);
  const wt = path.join(tmpDir, 'wt');
  git(['worktree', 'add', '-q', wt, '-b', 'feature'], repo);

  assert.equal(resolveTrailDbPath(wt), path.join(fs.realpathSync(repo), '.anytime', 'trail', 'db', 'trail.db'));
});

test('resolveTrailDbPath: 保護領域 (.claude) を指す TRAIL_HOME は throw', () => {
  process.env.TRAIL_HOME = path.join(os.homedir(), '.claude', 'trail');
  assert.throws(() => resolveTrailDbPath(), /refusing protected path/);
});

test('openVerificationLedger: 二重 open しても DDL は冪等', () => {
  const dbPath = path.join(tmpDir, 'db', 'trail.db');
  openVerificationLedger(dbPath).close();
  const db = openVerificationLedger(dbPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  assert.ok(tables.some((t) => t.name === 'verification_runs'));
  db.close();
});

test('recordRun: clean は code_state_hash=commit、dirty は NULL', () => {
  const db = openVerificationLedger(':memory:');
  recordRun(db, baseRun);
  recordRun(db, { ...baseRun, kind: 'build', treeState: 'dirty' });
  const rows = db.prepare('SELECT kind, code_state_hash FROM verification_runs ORDER BY id').all();
  assert.equal(rows[0].code_state_hash, 'abc123');
  assert.equal(rows[1].code_state_hash, null);
  db.close();
});

test('recordRun: 不正な kind は throw', () => {
  const db = openVerificationLedger(':memory:');
  assert.throws(() => recordRun(db, { ...baseRun, kind: 'nosuch' }), /unknown kind/);
  db.close();
});

test('queryVerifiedKinds: pass のみ・kind ごとに最新を返す', () => {
  const db = openVerificationLedger(':memory:');
  recordRun(db, { ...baseRun, status: 'fail', startedAt: '2026-07-06T00:00:00.000Z' });
  recordRun(db, { ...baseRun, startedAt: '2026-07-06T01:00:00.000Z' });
  recordRun(db, { ...baseRun, startedAt: '2026-07-06T02:00:00.000Z' });
  recordRun(db, { ...baseRun, kind: 'typecheck', status: 'fail' });
  const verified = queryVerifiedKinds(db, { packageName: 'markdown-editor', codeStateHash: 'abc123' });
  assert.deepEqual([...verified.keys()], ['unit']);
  assert.equal(verified.get('unit').started_at, '2026-07-06T02:00:00.000Z');
  db.close();
});

test('listRuns: commit / 期間でフィルタする', () => {
  const db = openVerificationLedger(':memory:');
  recordRun(db, baseRun);
  recordRun(db, { ...baseRun, commitHash: 'def456', startedAt: '2026-07-07T00:00:00.000Z' });
  assert.equal(listRuns(db, { commitHash: 'abc123' }).length, 1);
  assert.equal(listRuns(db, { sinceIso: '2026-07-07T00:00:00.000Z' }).length, 1);
  assert.equal(listRuns(db).length, 2);
  db.close();
});

// 回帰: writer の DDL は trail-core の正本のミラー。CREATE TABLE IF NOT EXISTS は先に作った側が
// 勝つため、CHECK が緩い方が先に走るとテーブルがその制約で固定される。文字列で突合して守る。
test('SCHEMA_STATEMENTS: verification_runs の DDL が trail-core の正本と一致する', () => {
  const canonicalSrc = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'packages', 'trail-core', 'src', 'domain', 'schema', 'tables.ts'),
    'utf8',
  );
  const globs = Object.fromEntries(
    [...canonicalSrc.matchAll(/const (TS_GLOB_MS|TS_GLOB_NO_MS) = `([^`]*)`/g)].map((m) => [m[1], m[2]]),
  );
  assert.ok(globs['TS_GLOB_MS'] && globs['TS_GLOB_NO_MS'], '正本から timestamp glob を取り出せなかった');

  const declared = /export const CREATE_VERIFICATION_RUNS = `([\s\S]*?)`;/.exec(canonicalSrc);
  assert.ok(declared, '正本に CREATE_VERIFICATION_RUNS が見つからない');
  const canonical = declared[1].replace(/\$\{(TS_GLOB_MS|TS_GLOB_NO_MS)\}/g, (_, k) => globs[k]);

  const normalize = (sql) => sql.replace(/IF NOT EXISTS /, '').replace(/\s+/g, ' ').trim();
  assert.equal(normalize(SCHEMA_STATEMENTS[0]), normalize(canonical));
});

test('VERIFICATION_KINDS: RFC の 7 種別', () => {
  assert.deepEqual([...VERIFICATION_KINDS], ['unit', 'build', 'next-build', 'typecheck', 'lint', 'e2e', 'manual']);
});
