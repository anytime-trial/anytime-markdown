import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

//
// git の reference-transaction / post-checkout フックから起動され、ref 操作を
// agent-status ワーカーへ記録する。ワーカー停止時は spool へ退避する。
//
// 設計の要点:
// - op_type は GIT_REFLOG_ACTION では判定できない。reflog subject を読む。
// - 帰属は環境変数の観測であって推測ではない。
// - branch 削除は old/new とも全ゼロ SHA で渡るため、失われた SHA は prepared 段階で退避する。
// - 常に exit 0（Fail-open）。記録の失敗が git 操作を止めてはならない。

const OP_PREFIXES = [
  ['commit', 'commit'],
  ['reset', 'reset'],
  ['merge', 'merge'],
  ['rebase', 'rebase'],
  ['cherry-pick', 'cherry-pick'],
  ['revert', 'revert'],
  ['branch', 'branch-create'],
  ['checkout', 'checkout'],
  ['pull', 'fetch'],
  ['fetch', 'fetch'],
  ['push', 'push'],
  ['clone', 'other'],
];

/**
 * reflog subject から操作種別を判定する。
 * @param {string} subject `git reflog -1 --format=%gs` の値
 * @param {{deleted?: boolean}} [opts] ref 削除なら deleted: true
 */
export function classifyOp(subject, opts = {}) {
  if (opts.deleted) return 'branch-delete';
  const s = String(subject ?? '').trim();
  for (const [prefix, op] of OP_PREFIXES) {
    if (s === prefix || s.startsWith(`${prefix}:`) || s.startsWith(`${prefix} `) || s.startsWith(`${prefix} (`)) {
      return op;
    }
  }
  return 'other';
}

/**
 * 実行者を環境変数から観測する。推測はしない。
 * @param {Record<string, string | undefined>} env
 */
export function resolveAttribution(env) {
  const sessionId = env.CLAUDE_CODE_SESSION_ID?.trim();
  if (sessionId) {
    return { attribution: 'claude', sessionId, agentKind: 'claude-code' };
  }
  const agent = env.AI_AGENT?.trim();
  if (agent) {
    return { attribution: 'agent', sessionId: null, agentKind: agent };
  }
  return { attribution: 'human', sessionId: null, agentKind: null };
}

/**
 * 破壊的（作業を失い得る）操作か。
 * @param {string} opType
 * @param {{rewinds?: boolean, forced?: boolean}} ctx rewinds: ref が祖先方向へ戻る / forced: force push
 */
export function isDestructive(opType, ctx = {}) {
  if (opType === 'branch-delete') return true;
  if (opType === 'reset') return ctx.rewinds === true;
  if (opType === 'push') return ctx.forced === true;
  return false;
}

const ZERO_SHA = '0'.repeat(40);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/**
 * prepared → committed 間で削除予定 ref の SHA を渡す退避ファイル。
 *
 * PID でキーを分けてはいけない: prepared と committed は git から**別プロセスとして**起動されるため
 * process.ppid が一致せず、退避を読み出せない（実測で before_sha が失われた）。
 * git は ref トランザクション中 ref ロックを保持するため、リポジトリ単位の単一ファイルで足りる。
 */
function pendingPath(gitDir) {
  return join(gitDir, 'anytime-git-activity-pending.json');
}

/**
 * 直前の spool 行が同一 ref の branch-delete で、かつ windowMs 以内なら重複とみなす。
 *
 * git はブランチ削除時に ref トランザクションを 2 回発行する（loose ref と packed-refs）。
 * 1 回目は prepared で SHA を解決できるが、2 回目は ref が既に無く SHA を持たない。
 * 削除に限定して抑止する（commit 等で抑止すると、5 秒以内の連続コミットを取りこぼす）。
 */
export function isDuplicateDelete(row, workspacePath, windowMs = 5000) {
  if (row.opType !== 'branch-delete') return false;
  const p = spoolFilePath(workspacePath);
  if (!existsSync(p)) return false;

  const lines = readFileSync(p, 'utf8').trim().split('\n');
  const last = lines.at(-1);
  if (!last) return false;

  try {
    const prev = JSON.parse(last);
    if (prev.opType !== 'branch-delete' || prev.refName !== row.refName) return false;
    const deltaMs = Date.parse(row.occurredAt) - Date.parse(prev.occurredAt);
    return Number.isFinite(deltaMs) && deltaMs >= 0 && deltaMs <= windowMs;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[git-activity] spool 末尾行の解析に失敗した (${reason})\n`);
    return false;
  }
}

function spoolFilePath(workspacePath) {
  return join(workspacePath, '.anytime', 'agent', 'git-activity-spool.jsonl');
}

/**
 * reference-transaction フックの本体。
 * @param {'prepared'|'committed'|'aborted'} state
 * @param {string} stdin `<old> <new> <ref>` の行
 */
function handleReferenceTransaction(state, stdin) {
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  const pending = pendingPath(gitDir);

  const lines = stdin
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((l) => {
      const [old, next, ...rest] = l.split(/\s+/);
      return { old, next, ref: rest.join(' ') };
    })
    .filter((r) => r.ref.startsWith('refs/heads/'));

  if (state === 'aborted') {
    rmSync(pending, { force: true });
    return;
  }

  if (state === 'prepared') {
    const deleted = {};
    for (const r of lines) {
      if (r.next !== ZERO_SHA) continue;
      try {
        deleted[r.ref] = git(['rev-parse', '--verify', r.ref]);
      } catch (err) {
        const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
        process.stderr.write(`[git-activity] 削除対象 ${r.ref} の SHA を解決できなかった: ${reason}\n`);
      }
    }
    if (Object.keys(deleted).length > 0) {
      writeFileSync(pending, JSON.stringify(deleted));
    }
    return;
  }

  if (state !== 'committed') return;

  let deleted = {};
  if (existsSync(pending)) {
    try {
      deleted = JSON.parse(readFileSync(pending, 'utf8'));
    } catch (err) {
      const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
      process.stderr.write(`[git-activity] pending ファイル ${pending} を読めなかった: ${reason}\n`);
    } finally {
      rmSync(pending, { force: true });
    }
  }

  const workspacePath = git(['rev-parse', '--show-toplevel']);
  const who = resolveAttribution(process.env);
  const occurredAt = new Date().toISOString();

  for (const r of lines) {
    const isDeleted = r.next === ZERO_SHA;
    const beforeSha = isDeleted ? (deleted[r.ref] ?? null) : nullIfZero(r.old);
    const afterSha = isDeleted ? null : nullIfZero(r.next);

    let subject = '';
    if (!isDeleted) {
      try {
        subject = git(['reflog', '-1', '--format=%gs', r.ref]);
      } catch (err) {
        const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
        process.stderr.write(`[git-activity] reflog subject を読めなかった ref=${r.ref}: ${reason}\n`);
      }
    }

    const opType = classifyOp(subject, { deleted: isDeleted });
    const rewinds =
      opType === 'reset' && beforeSha !== null && afterSha !== null
        ? isAncestor(afterSha, beforeSha)
        : false;

    spool(
      {
        workspacePath,
        opType,
        destructive: isDestructive(opType, { rewinds }),
        refName: r.ref,
        beforeSha,
        afterSha,
        attribution: who.attribution,
        agentKind: who.agentKind,
        sessionId: who.sessionId,
        occurredAt,
      },
      workspacePath,
    );
  }
}

function nullIfZero(sha) {
  return !sha || sha === ZERO_SHA ? null : sha;
}

function isAncestor(a, b) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', a, b], { stdio: 'ignore' });
  if (result.error) {
    const reason = result.error.stack ?? result.error.message;
    process.stderr.write(`[git-activity] ancestor 判定に失敗 a=${a} b=${b}: ${reason}\n`);
  }
  return result.status === 0;
}

function spool(row, workspacePath) {
  if (isDuplicateDelete(row, workspacePath)) return;
  const p = spoolFilePath(workspacePath);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, `${JSON.stringify(row)}\n`);
}

function handlePostCheckout(prevHead, newHead, branchFlag) {
  if (branchFlag !== '1') return;
  if (prevHead === newHead) return;
  const workspacePath = git(['rev-parse', '--show-toplevel']);
  const who = resolveAttribution(process.env);
  spool(
    {
      workspacePath,
      opType: 'checkout',
      destructive: false,
      refName: `refs/heads/${git(['rev-parse', '--abbrev-ref', 'HEAD'])}`,
      beforeSha: nullIfZero(prevHead),
      afterSha: nullIfZero(newHead),
      attribution: who.attribution,
      agentKind: who.agentKind,
      sessionId: who.sessionId,
      occurredAt: new Date().toISOString(),
    },
    workspacePath,
  );
}

function main() {
  const mode = process.argv[2];
  try {
    if (mode === 'reference-transaction') {
      const state = process.argv[3];
      const stdin = readFileSync(0, 'utf8');
      handleReferenceTransaction(state, stdin);
    } else if (mode === 'post-checkout') {
      handlePostCheckout(process.argv[3], process.argv[4], process.argv[5]);
    }
  } catch (err) {
    const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`[git-activity] 記録に失敗した: ${reason}\n`);
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith('git-activity-report.mjs')) {
  main();
}
