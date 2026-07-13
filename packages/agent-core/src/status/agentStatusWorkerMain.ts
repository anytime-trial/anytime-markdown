// status/agentStatusWorkerMain.ts — spawn されるワーカープロセスのエントリポイント
//
// agent 拡張が `node --disable-warning=ExperimentalWarning <bundle> <workspaceRoot>` で spawn する。
// node:sqlite を import する AgentStatusStore はこのプロセス内でのみ生きる。
//
// 起動シーケンス:
//   1. workspaceRoot を argv から取得
//   2. AgentStatusStore を開く（agent-status.db）
//   3. 動的ポートで HTTP サーバ起動
//   4. agent-worker.json に接続情報を書く
//   5. SIGINT/SIGTERM/exit で agent-worker.json を消し DB を閉じる

import { randomBytes } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, normalize, sep } from 'node:path';
import { AgentStatusStore } from './AgentStatusStore';
import { AgentStatusWorker } from './AgentStatusWorker';
import { drainSpool, spoolPath } from './gitActivitySpool';
import {
  AGENT_WORKER_SCHEMA_VERSION,
  agentStatusDbPath,
  agentWorkerJsonPath,
  removeWorkerInfo,
  writeWorkerInfo,
} from './agentWorkerInfo';

const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_GIT_ACTIVITY_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 未使用セッションの保持日数を env から解決する。
 * 不在・非数値・1 未満は既定 7 日へフォールバックする。
 */
function resolveRetentionDays(): number {
  const raw = process.env.ANYTIME_AGENT_SESSION_RETENTION_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_RETENTION_DAYS;
}

function resolveGitActivityRetentionDays(): number {
  const raw = process.env.ANYTIME_GIT_ACTIVITY_RETENTION_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_GIT_ACTIVITY_RETENTION_DAYS;
}

/**
 * argv 由来の workspaceRoot を検証し、以降の I/O で使う正規化済みパスを返す。
 *
 * ファイルシステムへ触れる前に構文検証を終える（絶対パス・NUL 不在・親参照 `..` 不在・
 * 正規化しても変化しないこと）。その後 realpath でシンボリックリンクを解決し、
 * 実在するディレクトリであることを確認する。呼び出し側は必ず戻り値を使うこと
 * （検証前の生文字列を後続のパス構築に使うと検証が無意味になる）。
 *
 * @returns 検証済みの正規化パス（realpath 解決済み）
 * @throws 検証に失敗した場合
 */
export function assertValidWorkspaceRoot(workspaceRoot: string): string {
  if (!isAbsolute(workspaceRoot) || workspaceRoot.includes('\0')) {
    throw new Error(`workspaceRoot must be an absolute path without NUL: ${JSON.stringify(workspaceRoot)}`);
  }
  const normalized = normalize(workspaceRoot);
  if (normalized !== workspaceRoot || workspaceRoot.split(sep).includes('..')) {
    throw new Error(`workspaceRoot must be normalized without path traversal: ${JSON.stringify(workspaceRoot)}`);
  }
  let real: string;
  try {
    real = realpathSync(normalized);
  } catch (err) {
    throw new Error(
      `workspaceRoot is not an existing directory: ${workspaceRoot} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (!statSync(real, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`workspaceRoot is not an existing directory: ${workspaceRoot}`);
  }
  return real;
}

export async function runWorker(workspaceRoot: string): Promise<void> {
  // 以降のパス構築は検証済みの正規化パスのみを使う（生の argv 文字列は使わない）。
  const validatedRoot = assertValidWorkspaceRoot(workspaceRoot);
  const dbPath = agentStatusDbPath(validatedRoot);
  const jsonPath = agentWorkerJsonPath(validatedRoot);

  // 書き込み系を保護する Bearer トークン。agent-worker.json（0600）にのみ書き、
  // それを読める同一ユーザーの hook/拡張だけが POST できる。
  const token = randomBytes(32).toString('hex');

  const store = new AgentStatusStore(dbPath);
  const spool = spoolPath(validatedRoot);
  const spooled = drainSpool(spool, (msg) => console.error(msg));
  for (const row of spooled) {
    try {
      store.insertGitActivity(row);
    } catch (err) {
      const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
      console.error(`[git-activity] spool 行の取り込みに失敗: ${reason}`);
    }
  }
  if (spooled.length > 0) {
    console.error(`[git-activity] spool から ${spooled.length} 件を取り込んだ`);
  }

  const gitActivityRetentionDays = resolveGitActivityRetentionDays();
  const gitActivityCutoff = new Date(Date.now() - gitActivityRetentionDays * DAY_MS).toISOString();
  const prunedGitActivity = store.pruneGitActivityOlderThan(gitActivityCutoff);
  if (prunedGitActivity > 0) {
    console.error(`[git-activity] 保持期間（${gitActivityRetentionDays} 日）を超えた ${prunedGitActivity} 件を削除した`);
  }

  const worker = new AgentStatusWorker(store, token);
  await worker.start(0);

  writeWorkerInfo(jsonPath, {
    schemaVersion: AGENT_WORKER_SCHEMA_VERSION,
    pid: process.pid,
    host: '127.0.0.1',
    port: worker.port,
    url: worker.url,
    startedAt: new Date().toISOString(),
    dbPath,
    token,
  });

  // 未使用セッションの定期 prune: 起動時に 1 回＋日次。古い行を agent_sessions から削除する。
  const retentionDays = resolveRetentionDays();
  const runPrune = (): void => {
    try {
      const cutoff = new Date(Date.now() - retentionDays * DAY_MS).toISOString();
      const deleted = store.pruneSessionsOlderThan(cutoff);
      if (deleted > 0) {
        console.error(
          `[agent-status] pruned ${deleted} unused session(s) older than ${cutoff} (retention=${retentionDays}d)`,
        );
      }
    } catch (err) {
      console.error(
        `[agent-status] session prune failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
    }
  };
  runPrune();
  const pruneTimer = setInterval(runPrune, DAY_MS);
  pruneTimer.unref();

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(pruneTimer);
    removeWorkerInfo(jsonPath);
    void worker.stop().finally(() => {
      store.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
}

// 直接実行されたときのみ起動する（テストから import される場合は副作用なし）。
if (require.main === module) {
  const workspaceRoot = process.argv[2];
  if (!workspaceRoot) {
    console.error('[agent-status] usage: agentStatusWorkerMain <workspaceRoot>');
    process.exit(1);
  }
  runWorker(workspaceRoot).catch((err: unknown) => {
    console.error(`[agent-status] worker failed to start: ${String(err)}`);
    process.exit(1);
  });
}
