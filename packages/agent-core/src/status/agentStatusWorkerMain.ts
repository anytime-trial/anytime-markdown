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
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { AgentStatusStore } from './AgentStatusStore';
import { AgentStatusWorker } from './AgentStatusWorker';
import {
  AGENT_WORKER_SCHEMA_VERSION,
  agentStatusDbPath,
  agentWorkerJsonPath,
  removeWorkerInfo,
  writeWorkerInfo,
} from './agentWorkerInfo';

const DEFAULT_RETENTION_DAYS = 7;
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

/**
 * argv 由来の workspaceRoot を検証する。存在する絶対パスのディレクトリのみ許可し、
 * 相対パス・NUL 混入・ファイル指定でのファイルシステム外への逸脱を入口で断つ。
 * @throws 検証に失敗した場合
 */
export function assertValidWorkspaceRoot(workspaceRoot: string): void {
  if (!isAbsolute(workspaceRoot) || workspaceRoot.includes('\0')) {
    throw new Error(`workspaceRoot must be an absolute path without NUL: ${JSON.stringify(workspaceRoot)}`);
  }
  if (!statSync(workspaceRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`workspaceRoot is not an existing directory: ${workspaceRoot}`);
  }
}

export async function runWorker(workspaceRoot: string): Promise<void> {
  assertValidWorkspaceRoot(workspaceRoot);
  const dbPath = agentStatusDbPath(workspaceRoot);
  const jsonPath = agentWorkerJsonPath(workspaceRoot);

  // 書き込み系を保護する Bearer トークン。agent-worker.json（0600）にのみ書き、
  // それを読める同一ユーザーの hook/拡張だけが POST できる。
  const token = randomBytes(32).toString('hex');

  const store = new AgentStatusStore(dbPath);
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
