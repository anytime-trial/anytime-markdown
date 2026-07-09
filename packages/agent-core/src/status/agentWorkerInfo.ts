// status/agentWorkerInfo.ts — agent-worker.json の読み書きと生存確認
//
// trail の DaemonLifecycle と同作法（アトミック書き込み・process.kill(pid,0) 生存確認）。
// SQLite を import しないため consumer 拡張からも安全に利用できる。

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { AgentWorkerInfo } from './types';

// v2: token フィールド（書き込み系 Bearer 認証）を追加。
export const AGENT_WORKER_SCHEMA_VERSION = 2;

/** ワークスペース直下の agent-worker.json のパスを返す */
export function agentWorkerJsonPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.anytime', 'agent', 'agent-worker.json');
}

/** ワークスペース直下の agent-status.db のパスを返す */
export function agentStatusDbPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.anytime', 'agent', 'agent-status.db');
}

export function readWorkerInfo(jsonPath: string): AgentWorkerInfo | undefined {
  if (!existsSync(jsonPath)) return undefined;
  try {
    return JSON.parse(readFileSync(jsonPath, 'utf8')) as AgentWorkerInfo;
  } catch (err) {
    console.error(`[agent-status] failed to read worker info ${jsonPath}: ${String(err)}`);
    return undefined;
  }
}

export function writeWorkerInfo(jsonPath: string, info: AgentWorkerInfo): void {
  mkdirSync(dirname(jsonPath), { recursive: true });
  const tmp = `${jsonPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(info, null, 2));
  try {
    chmodSync(tmp, 0o600);
  } catch (err) {
    // tmpfs 等 chmod 非対応の FS では 0600 を付けられない。トークンを含むため警告する。
    console.warn(`[agent-status] failed to chmod 0600 worker info ${tmp}: ${String(err)}`);
  }
  renameSync(tmp, jsonPath);
}

export function removeWorkerInfo(jsonPath: string): void {
  if (existsSync(jsonPath)) {
    rmSync(jsonPath);
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const e = err as { code?: string };
    return e.code === 'EPERM';
  }
}

/** agent-worker.json が存在し、その pid が生存しているか */
export function isWorkerAlive(jsonPath: string): boolean {
  const info = readWorkerInfo(jsonPath);
  if (!info) return false;
  return isPidAlive(info.pid);
}
