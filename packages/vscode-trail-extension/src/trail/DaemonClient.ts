import { join } from 'node:path';
import { DaemonLifecycle } from '@anytime-markdown/trail-server';
import type { DaemonInfo, Logger } from '@anytime-markdown/trail-server';
import { getTrailHome } from '@anytime-markdown/memory-core';

export interface DaemonClientOptions {
  logger: Logger;
  workspaceRoot?: string;
}

/**
 * 外部で起動済みの trail-server デーモンを検出し、接続情報を提供する。
 * Milestone C-2 では read-only — デーモンの起動・停止は行わない。
 */
export class DaemonClient {
  private readonly lifecycle: DaemonLifecycle;
  private readonly logger: Logger;
  private cached: DaemonInfo | undefined;

  constructor(opts: DaemonClientOptions) {
    const trailHome = getTrailHome(opts.workspaceRoot);
    this.lifecycle = new DaemonLifecycle({
      jsonPath: join(trailHome, 'daemon.json'),
      lockPath: join(trailHome, 'daemon.lock'),
    });
    this.logger = opts.logger;
  }

  /** ライブデーモンが検出された場合は DaemonInfo を返す。検出されなければ undefined。 */
  detect(): DaemonInfo | undefined {
    const info = this.lifecycle.readDaemonJson();
    if (!info) {
      this.cached = undefined;
      return undefined;
    }
    if (!this.lifecycle.isDaemonAlive()) {
      this.logger.warn(`[DaemonClient] found stale daemon.json (pid not alive): ${JSON.stringify({ pid: info.pid })}`);
      this.cached = undefined;
      return undefined;
    }
    this.cached = info;
    return info;
  }

  get info(): DaemonInfo | undefined {
    return this.cached;
  }

  get url(): string | undefined {
    return this.cached?.url;
  }

  /** 非同期ヘルスチェック — デーモン URL の GET / をピング。 */
  async ping(timeoutMs = 1000): Promise<boolean> {
    const info = this.cached;
    if (!info) return false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${info.url}/`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok || res.status === 200 || res.status === 304;
    } catch {
      return false;
    }
  }
}
