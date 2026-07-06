#!/usr/bin/env node
/**
 * run-verified — 検証コマンドを実行し結果を verification.db に記録するラッパー。
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
  openVerificationDb,
  recordRun,
  resolveVerificationDbPath,
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
      status = 'error';
      exitCode = 1;
    } else {
      exitCode = r.status ?? 1;
      status = exitCode === 0 ? 'pass' : 'fail';
    }
  }
  const finishedAt = new Date().toISOString();

  const db = openVerificationDb(resolveVerificationDbPath(cwd));
  try {
    recordRun(db, {
      sessionId: process.env.CLAUDE_SESSION_ID ?? null,
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
  } finally {
    db.close();
  }
  console.log(
    `[${finishedAt}] [INFO] run-verified: ${parsed.packageName}/${parsed.kind} ${status} (${treeState}@${commitHash.slice(0, 8)})`,
  );
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
