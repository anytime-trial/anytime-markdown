// agentStatusWorkerEntry.ts — webpack で dist/agent-status-worker.js にバンドルされる spawn 用エントリ。
//
// agent 拡張が `node --disable-warning=ExperimentalWarning dist/agent-status-worker.js <workspaceRoot>`
// で起動する。node:sqlite を import する AgentStatusStore はこのプロセス内でのみ生きる。

import { runWorker } from '@anytime-markdown/agent-core';

const workspaceRoot = process.argv[2];
if (!workspaceRoot) {
  console.error('[agent-status] usage: agent-status-worker.js <workspaceRoot>');
  process.exit(1);
}

runWorker(workspaceRoot).catch((err: unknown) => {
  console.error(`[agent-status] worker failed to start: ${String(err)}`);
  process.exit(1);
});
