import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openVerificationLedger } from './verification-db.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run-verified.mjs');

let tmpTrailHome;
beforeEach(() => {
  tmpTrailHome = fs.mkdtempSync(path.join(os.tmpdir(), 'runverified-'));
});
afterEach(() => {
  fs.rmSync(tmpTrailHome, { recursive: true, force: true });
});

function runWrapper(args, envOverrides = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, TRAIL_HOME: tmpTrailHome, ...envOverrides },
    encoding: 'utf8',
  });
}

function readRows() {
  const db = openVerificationLedger(path.join(tmpTrailHome, 'db', 'activity.db'));
  const rows = db.prepare('SELECT * FROM activity_verification_runs ORDER BY id').all();
  db.close();
  return rows;
}

test('成功コマンド: exit 0 で pass が記録される', () => {
  const r = runWrapper(['demo-pkg', 'unit', '--', process.execPath, '-e', 'process.exit(0)']);
  assert.equal(r.status, 0, r.stderr);
  const rows = readRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'unit');
  assert.equal(rows[0].status, 'pass');
  assert.match(rows[0].commit_hash, /^[0-9a-f]{40}$/);
});

test('失敗コマンド: 子プロセスの exit code を透過し fail が記録される', () => {
  const r = runWrapper(['demo-pkg', 'build', '--', process.execPath, '-e', 'process.exit(3)']);
  assert.equal(r.status, 3);
  assert.equal(readRows()[0].status, 'fail');
});

test('manual: コマンド実行なしで記録のみ行う', () => {
  const r = runWrapper(['demo-pkg', 'manual', '--status', 'pass', '--note', '実機確認: エディタでクリック編集を確認']);
  assert.equal(r.status, 0, r.stderr);
  const rows = readRows();
  assert.equal(rows[0].kind, 'manual');
  assert.equal(rows[0].command, '実機確認: エディタでクリック編集を確認');
});

// 回帰: 以前は CLAUDE_SESSION_ID（実在しない名前）を読んでいたため session_id が常に空で、
// Flight Record の指示へ 1 件も畳めなかった。結合キーなので個別に固定する。
test('CLAUDE_CODE_SESSION_ID を session_id と workspace_path に記録する', () => {
  const r = runWrapper(['demo-pkg', 'lint', '--', process.execPath, '-e', 'process.exit(0)'], {
    CLAUDE_CODE_SESSION_ID: 'sess-abc',
  });
  assert.equal(r.status, 0, r.stderr);
  const rows = readRows();
  assert.equal(rows[0].session_id, 'sess-abc');
  assert.equal(rows[0].workspace_path, process.cwd());
});

test('セッション ID が無い実行は空文字で記録し、紐づかない旨を警告する', () => {
  const r = runWrapper(['demo-pkg', 'lint', '--', process.execPath, '-e', 'process.exit(0)'], {
    CLAUDE_CODE_SESSION_ID: '',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readRows()[0].session_id, '');
  assert.match(r.stderr, /指示へ紐づきません/);
});

test('不正な kind は exit 2 で何も記録しない', () => {
  const r = runWrapper(['demo-pkg', 'nosuch', '--', 'true']);
  assert.equal(r.status, 2);
  assert.equal(fs.existsSync(path.join(tmpTrailHome, 'db', 'activity.db')), false);
});
