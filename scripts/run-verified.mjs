#!/usr/bin/env node
/**
 * run-verified — 検証コマンドを実行し結果を trail.db (verification_runs) に記録するラッパー。
 *
 * 使い方:
 *   node scripts/run-verified.mjs <package> <kind> -- <command...>
 *   node scripts/run-verified.mjs <package> manual --status pass|fail --note "<実施内容>"
 *
 * 終了コードは検証コマンドの終了コードを透過する（引数不正・記録前エラーは 2）。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  VERIFICATION_KINDS,
  RUN_STATUSES,
  openVerificationLedger,
  recordRun,
  resolveTrailDbPath,
} from './verification-db.mjs';

const USAGE = `usage:
  node scripts/run-verified.mjs <package> <kind> -- <command...>
  node scripts/run-verified.mjs <package> manual --status pass|fail --note "<実施内容>"
kinds: ${VERIFICATION_KINDS.join(' / ')}`;

/** argv（node とスクリプトパスを除く）を解析する。不正時は throw。 */
export function parseArgs(argv) {
  const [packageName, kind, ...rest] = argv;
  if (!packageName || !kind) throw new Error(USAGE);
  if (!VERIFICATION_KINDS.includes(kind)) throw new Error(`unknown kind "${kind}"\n${USAGE}`);
  if (kind === 'manual') {
    const statusIdx = rest.indexOf('--status');
    const noteIdx = rest.indexOf('--note');
    const status = statusIdx >= 0 ? rest[statusIdx + 1] : undefined;
    const note = noteIdx >= 0 ? rest[noteIdx + 1] : undefined;
    if (!status || !RUN_STATUSES.includes(status) || !note) {
      throw new Error(`manual には --status pass|fail と --note が必要\n${USAGE}`);
    }
    return { packageName, kind, manualStatus: status, note };
  }
  const sep = rest.indexOf('--');
  const command = sep >= 0 ? rest.slice(sep + 1) : [];
  if (command.length === 0) throw new Error(`実行コマンドがありません（"--" の後に指定）\n${USAGE}`);
  return { packageName, kind, command };
}

/** git の現在状態（HEAD と clean/dirty）を検出する。 */
export function detectGitState(cwd) {
  const commitHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const porcelain = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
  return { commitHash, treeState: porcelain.trim() === '' ? 'clean' : 'dirty' };
}

/** 検証を実行して記録し、透過すべき終了コードを返す。 */
export function runVerified(argv, { cwd = process.cwd() } = {}) {
  const parsed = parseArgs(argv);
  const { commitHash, treeState } = detectGitState(cwd);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  let status;
  let exitCode = 0;
  let command;
  if (parsed.kind === 'manual') {
    status = parsed.manualStatus;
    command = parsed.note;
    exitCode = status === 'pass' ? 0 : 1;
  } else {
    command = parsed.command.join(' ');
    const r = spawnSync(parsed.command[0], parsed.command.slice(1), { stdio: 'inherit', cwd });
    if (r.error) {
      console.error(`[${new Date().toISOString()}] [ERROR] run-verified: spawn failed for "${command}": ${r.error.stack ?? r.error}`);
      status = 'error';
      exitCode = 1;
    } else {
      exitCode = r.status ?? 1;
      status = exitCode === 0 ? 'pass' : 'fail';
    }
  }
  const finishedAt = new Date().toISOString();

  // Claude Code が実際に渡すのは CLAUDE_CODE_SESSION_ID（scripts/git-activity-report.mjs と同じ）。
  // この ID が Flight Record の指示への唯一の結合キーで、空だと指示へ畳まれない。
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID ?? '';
  // 記録は副作用であって検証の合否ではない。trail.db は拡張が WAL で同時利用する共有 DB な
  // ので open / INSERT は競合・保護パス・ディスク枯渇で失敗しうるが、そこで例外を上へ抜くと
  // トップレベルの catch が exit 2 を返し、**成功した検証コマンドが失敗として伝わる**。
  // 失敗は握りつぶさずログに出し、終了コードは検証コマンドのものを透過する。
  let db;
  try {
    db = openVerificationLedger(resolveTrailDbPath(cwd));
    recordRun(db, {
      sessionId,
      workspacePath: cwd,
      kind: parsed.kind,
      package: parsed.packageName,
      command,
      status,
      durationMs: Date.now() - t0,
      commitHash,
      treeState,
      environment: JSON.stringify({ node: process.version, platform: process.platform }),
      startedAt,
      finishedAt,
    });
  } catch (err) {
    console.error(
      `[${finishedAt}] [ERROR] run-verified: 台帳への記録に失敗（検証結果 ${status} はそのまま透過する）: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    );
  } finally {
    db?.close();
  }
  console.log(
    `[${finishedAt}] [INFO] run-verified: ${parsed.packageName}/${parsed.kind} ${status} (${treeState}@${commitHash.slice(0, 8)})`,
  );
  if (sessionId === '') {
    console.warn(
      `[${finishedAt}] [WARN] run-verified: CLAUDE_CODE_SESSION_ID が空のため Flight Record の指示へ紐づきません（記録は残ります）`,
    );
  }
  return exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(runVerified(process.argv.slice(2)));
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [ERROR] run-verified: ${err.stack ?? err}`);
    process.exit(2);
  }
}
