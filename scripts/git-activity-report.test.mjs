import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkoutRefName,
  classifyOp,
  isDestructive,
  isDuplicateDelete,
  parsePrePushLine,
  resolveAttribution,
} from './git-activity-report.mjs';

test('reflog subject から op_type を判定する', () => {
  assert.equal(classifyOp('commit: add feature'), 'commit');
  assert.equal(classifyOp('commit (initial): c1'), 'commit');
  assert.equal(classifyOp('commit (amend): c1'), 'commit');
  assert.equal(classifyOp('reset: moving to HEAD~1'), 'reset');
  assert.equal(classifyOp("merge feature/x: Merge made by the 'ort' strategy."), 'merge');
  assert.equal(classifyOp('branch: Created from HEAD'), 'branch-create');
  assert.equal(classifyOp('rebase (finish): refs/heads/develop onto abc'), 'rebase');
  assert.equal(classifyOp('cherry-pick: fix typo'), 'cherry-pick');
  assert.equal(classifyOp('revert: Revert "bad"'), 'revert');
  assert.equal(classifyOp('pull: Fast-forward'), 'fetch');
  assert.equal(classifyOp('checkout: moving from master to feature/x'), 'checkout');
});

test('未知の subject は other に落とす（記録は捨てない）', () => {
  assert.equal(classifyOp('something entirely new'), 'other');
  assert.equal(classifyOp(''), 'other');
});

test('ref 削除は subject によらず branch-delete と判定する', () => {
  assert.equal(classifyOp('commit: c2', { deleted: true }), 'branch-delete');
});

test('CLAUDE_CODE_SESSION_ID があれば claude として帰属する', () => {
  const a = resolveAttribution({ CLAUDE_CODE_SESSION_ID: 'sess-1', CLAUDECODE: '1' });
  assert.deepEqual(a, { attribution: 'claude', sessionId: 'sess-1', agentKind: 'claude-code' });
});

test('AI_AGENT だけなら agent として帰属し、sessionId は持たない', () => {
  const a = resolveAttribution({ AI_AGENT: 'codex' });
  assert.deepEqual(a, { attribution: 'agent', sessionId: null, agentKind: 'codex' });
});

test('いずれも無ければ human と断定する（unknown にしない）', () => {
  const a = resolveAttribution({});
  assert.deepEqual(a, { attribution: 'human', sessionId: null, agentKind: null });
});

test('CLAUDE_CODE_SESSION_ID が空文字なら claude 扱いしない', () => {
  const a = resolveAttribution({ CLAUDE_CODE_SESSION_ID: '' });
  assert.equal(a.attribution, 'human');
});

test('reset / branch-delete / force push は破壊的', () => {
  assert.equal(isDestructive('reset', { rewinds: true }), true);
  assert.equal(isDestructive('branch-delete', {}), true);
  assert.equal(isDestructive('push', { forced: true }), true);
});

test('前進のみの reset（HEAD を進めるだけ）は破壊的としない', () => {
  assert.equal(isDestructive('reset', { rewinds: false }), false);
});

test('commit / merge / checkout は破壊的としない', () => {
  assert.equal(isDestructive('commit', {}), false);
  assert.equal(isDestructive('merge', {}), false);
  assert.equal(isDestructive('checkout', {}), false);
});

// --- ブランチ削除の二重記録抑止（git は削除時に ref トランザクションを 2 回発行する） ---

/** spool に 1 行だけ書いた一時ワークスペースを作る */
function wsWithSpool(row) {
  const ws = mkdtempSync(join(tmpdir(), 'git-activity-ws-'));
  mkdirSync(join(ws, '.anytime', 'agent'), { recursive: true });
  writeFileSync(join(ws, '.anytime', 'agent', 'git-activity-spool.jsonl'), `${JSON.stringify(row)}\n`);
  return ws;
}

const del = (over = {}) => ({
  opType: 'branch-delete',
  refName: 'refs/heads/feature/x',
  occurredAt: '2026-07-13T00:00:00.000Z',
  ...over,
});

test('同一 ref の branch-delete が 5 秒以内に続いたら重複として抑止する', () => {
  const ws = wsWithSpool(del({ beforeSha: 'abc1234' }));
  const dup = del({ beforeSha: null, occurredAt: '2026-07-13T00:00:00.400Z' });
  assert.equal(isDuplicateDelete(dup, ws), true);
  rmSync(ws, { recursive: true, force: true });
});

test('別 ref の branch-delete は抑止しない', () => {
  const ws = wsWithSpool(del({ beforeSha: 'abc1234' }));
  const other = del({ refName: 'refs/heads/feature/y', occurredAt: '2026-07-13T00:00:00.400Z' });
  assert.equal(isDuplicateDelete(other, ws), false);
  rmSync(ws, { recursive: true, force: true });
});

test('5 秒を超えて離れた branch-delete は抑止しない', () => {
  const ws = wsWithSpool(del({ beforeSha: 'abc1234' }));
  const later = del({ occurredAt: '2026-07-13T00:00:10.000Z' });
  assert.equal(isDuplicateDelete(later, ws), false);
  rmSync(ws, { recursive: true, force: true });
});

test('commit は 5 秒以内の連続でも抑止しない（削除だけが git の二重発行対象）', () => {
  const ws = wsWithSpool({
    opType: 'commit',
    refName: 'refs/heads/develop',
    occurredAt: '2026-07-13T00:00:00.000Z',
  });
  const next = {
    opType: 'commit',
    refName: 'refs/heads/develop',
    occurredAt: '2026-07-13T00:00:00.400Z',
  };
  assert.equal(isDuplicateDelete(next, ws), false);
  rmSync(ws, { recursive: true, force: true });
});

test('spool が無ければ抑止しない', () => {
  const ws = mkdtempSync(join(tmpdir(), 'git-activity-ws-'));
  assert.equal(isDuplicateDelete(del(), ws), false);
  rmSync(ws, { recursive: true, force: true });
});

// --- force push の検知（pre-push フック。reference-transaction では原理的に取れない） ---

test('リモートの SHA がローカルの祖先でなければ force push と判定する', () => {
  // 非早送り = リモートにあるコミットが失われる = force
  assert.equal(
    parsePrePushLine('refs/heads/develop aaa refs/heads/develop bbb', () => false).forced,
    true,
  );
});

test('早送り（リモートの SHA がローカルの祖先）は force push としない', () => {
  assert.equal(
    parsePrePushLine('refs/heads/develop aaa refs/heads/develop bbb', () => true).forced,
    false,
  );
});

test('新規ブランチの push（リモート側が全ゼロ）は force push としない', () => {
  const zero = '0'.repeat(40);
  const r = parsePrePushLine(`refs/heads/new aaa refs/heads/new ${zero}`, () => false);
  assert.equal(r.forced, false);
  assert.equal(r.beforeSha, null);
});

test('リモートブランチの削除（ローカル側が全ゼロ）は push として記録し、破壊的とする', () => {
  const zero = '0'.repeat(40);
  const r = parsePrePushLine(`(delete) ${zero} refs/heads/gone bbb`, () => false);
  assert.equal(r.forced, true);
  assert.equal(r.afterSha, null);
});

test('force push は破壊的、通常 push は破壊的でない', () => {
  assert.equal(isDestructive('push', { forced: true }), true);
  assert.equal(isDestructive('push', { forced: false }), false);
});

// --- detached HEAD の ref 名（実在しない refs/heads/HEAD を作らない） ---

test('通常のブランチは refs/heads/<name> になる', () => {
  assert.equal(checkoutRefName('feature/x'), 'refs/heads/feature/x');
});

test('detached HEAD は refs/heads/HEAD にせず HEAD (detached) と記録する', () => {
  // git rev-parse --abbrev-ref HEAD は detached 時に文字列 "HEAD" を返す。
  // そのまま前置すると実在しない ref 名が DB に入る。
  assert.equal(checkoutRefName('HEAD'), 'HEAD (detached)');
});

// --- ブランチ削除の破壊判定（安全削除で狼少年にならないこと） ---

test('未マージのブランチ削除（branch -D）は破壊的', () => {
  // 削除された SHA がどの ref からも到達できない = コミットが失われる
  assert.equal(isDestructive('branch-delete', { reachable: false }), true);
});

test('マージ済みブランチの削除（branch -d）は破壊的としない', () => {
  // 削除された SHA が他の ref から到達可能 = どこかにマージ済み = 何も失われない。
  // ここで警告を出すと、通常のマージ運用のたびに鳴って警告が無視されるようになる。
  assert.equal(isDestructive('branch-delete', { reachable: true }), false);
});

test('到達可能性が判定できなかった場合は安全側（破壊的）に倒す', () => {
  assert.equal(isDestructive('branch-delete', {}), true);
});
