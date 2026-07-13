// AgentStatusWorkerHost.ts — agent-status ワーカープロセスの spawn / kill を管理する。
//
// owner（起動責任）は agent 拡張のみ。起動前に agent-worker.json の生存確認を行い、
// 既に生きていれば spawn せず接続だけする（複数ウィンドウでの二重起動防止）。
// deactivate 時に確実に kill する（OllamaProvider と異なり常駐ワーカーは孤児化させない）。

import * as cp from 'node:child_process';
import * as path from 'node:path';
import {
  agentWorkerJsonPath,
  isWorkerAlive,
  readWorkerInfo,
  removeWorkerInfo,
} from '@anytime-markdown/agent-core';
import type { AgentLogger } from '../utils/AgentLogger';

type Logger = Pick<typeof AgentLogger, 'info' | 'warn' | 'error'>;

export class AgentStatusWorkerHost {
  private child: cp.ChildProcess | undefined;
  private readonly jsonPath: string;

  constructor(
    private readonly workspaceRoot: string,
    private readonly workerScriptPath: string,
    private readonly logger: Logger,
    private readonly sessionRetentionDays: number = 7,
    private readonly gitActivityRetentionDays: number = 90,
  ) {
    this.jsonPath = agentWorkerJsonPath(workspaceRoot);
  }

  /**
   * ワーカーを起動する。
   * - 既存ワーカーが生存していれば spawn せず接続のみ（owner 一元化のため二重起動を防ぐ）。
   * - stale な agent-worker.json は掃除してから spawn する。
   */
  start(): void {
    if (isWorkerAlive(this.jsonPath)) {
      const info = readWorkerInfo(this.jsonPath);
      this.logger.info(
        `[agent-status] worker already running (pid=${info?.pid}, ${info?.url}); attaching as consumer`,
      );
      return;
    }
    // stale なファイルが残っていれば掃除（pid 死亡 or 異常終了の痕跡）
    removeWorkerInfo(this.jsonPath);

    const child = cp.spawn(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', this.workerScriptPath, this.workspaceRoot],
      {
        stdio: 'ignore',
        env: {
          ...process.env,
          ANYTIME_AGENT_SESSION_RETENTION_DAYS: String(this.sessionRetentionDays),
          ANYTIME_GIT_ACTIVITY_RETENTION_DAYS: String(this.gitActivityRetentionDays),
        },
      },
    );
    this.child = child;
    child.on('error', (err) => {
      this.logger.error(`[agent-status] worker spawn error: ${err.stack ?? String(err)}`);
    });
    child.on('exit', (code, signal) => {
      this.logger.info(`[agent-status] worker exited (code=${code}, signal=${signal})`);
      if (this.child === child) this.child = undefined;
    });
    this.logger.info(`[agent-status] worker spawned (pid=${child.pid})`);
  }

  /** ワーカーを停止する。SIGTERM で agent-worker.json を消させ、DB を閉じさせる。 */
  dispose(): void {
    if (this.child && this.child.exitCode === null) {
      try {
        this.child.kill('SIGTERM');
      } catch (err) {
        this.logger.warn(`[agent-status] failed to kill worker: ${String(err)}`);
      }
    }
    this.child = undefined;
  }
}

/** dist/agent-status-worker.js の絶対パスを解決する（extensionPath/dist 配下） */
export function resolveWorkerScriptPath(extensionPath: string): string {
  return path.join(extensionPath, 'dist', 'agent-status-worker.js');
}
