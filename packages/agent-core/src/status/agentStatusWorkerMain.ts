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

import { AgentStatusStore } from './AgentStatusStore';
import { AgentStatusWorker } from './AgentStatusWorker';
import {
  AGENT_WORKER_SCHEMA_VERSION,
  agentStatusDbPath,
  agentWorkerJsonPath,
  removeWorkerInfo,
  writeWorkerInfo,
} from './agentWorkerInfo';

export async function runWorker(workspaceRoot: string): Promise<void> {
  const dbPath = agentStatusDbPath(workspaceRoot);
  const jsonPath = agentWorkerJsonPath(workspaceRoot);

  const store = new AgentStatusStore(dbPath);
  const worker = new AgentStatusWorker(store);
  await worker.start(0);

  writeWorkerInfo(jsonPath, {
    schemaVersion: AGENT_WORKER_SCHEMA_VERSION,
    pid: process.pid,
    host: '127.0.0.1',
    port: worker.port,
    url: worker.url,
    startedAt: new Date().toISOString(),
    dbPath,
  });

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
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
