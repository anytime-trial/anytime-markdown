import type { Disposable } from '../runtime/Disposable';
import {
  openMemoryCoreDb,
  runRagFtsRebuild,
  type MemoryCoreDb,
} from '@anytime-markdown/memory-core';
import type { MemoryChatLogger } from './types';

/**
 * @deprecated Use MemoryChatLogger directly. Retained for backwards compat with external callers.
 */
export type RebuildSchedulerLogger = MemoryChatLogger;

export interface RebuildSchedulerOptions {
  readonly memoryDbPath: string;
  readonly memoryNativeBinding?: string;
  readonly logger: MemoryChatLogger;
}

type Trigger = 'startup' | 'cron' | 'manual';

const TS = (): string => new Date().toISOString();

function logPrefix(msg: string): string {
  return `[${TS()}] [INFO] rebuildScheduler ${msg}`;
}

/**
 * Memory chat の FTS5 インデックスを定期的に全体再構築するスケジューラ。
 *
 * - start() 時に 1 回 (startup) 走らせる
 * - 以降 intervalMs 毎に cron で走らせる
 * - runManual() で即時実行 (コマンドパレットから呼ぶ)
 *
 * 同時実行は内部の `running` フラグで防止する。memory-core 側にも
 * pipeline_state による CAS があるため二重実行は問題ないが、無駄な DB open を避ける。
 */
export class RebuildScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private memoryDb: MemoryCoreDb | undefined;

  constructor(private readonly opts: RebuildSchedulerOptions) {}

  start(intervalMs: number): Disposable {
    // memoryCoreRunner などの他コンシューマが activate 直後に同じ
    // memory-core.db を開いて migration を走らせるため、startup tick は
    // 10 秒遅らせて起動直後の write lock 競合を回避する。WAL +
    // busy_timeout が連携接続を許容しても、初期化シーケンスは可能な限り
    // 直列化したい。
    const startupDelayMs = 10_000;
    const startupTimer = setTimeout(() => void this.tick('startup'), startupDelayMs);
    const ms = Math.max(intervalMs, 5 * 60 * 1000); // floor 5min
    this.timer = setInterval(() => void this.tick('cron'), ms);
    return {
      dispose: () => {
        clearTimeout(startupTimer);
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        try {
          this.memoryDb?.close();
        } catch (error) {
          this.opts.logger.error('memoryDb close failed', error);
        }
        this.memoryDb = undefined;
      },
    };
  }

  async runManual(): Promise<void> {
    await this.tick('manual');
  }

  private async ensureDb(): Promise<MemoryCoreDb | null> {
    if (this.memoryDb) return this.memoryDb;
    try {
      this.memoryDb = await openMemoryCoreDb(this.opts.memoryDbPath, {
        nativeBinding: this.opts.memoryNativeBinding,
      });
      return this.memoryDb;
    } catch (error) {
      this.opts.logger.error(logPrefix('failed to open memory DB'), error);
      return null;
    }
  }

  private async tick(trigger: Trigger): Promise<void> {
    if (this.running) {
      this.opts.logger.info(logPrefix('skipped (already running)'), { trigger });
      return;
    }
    this.running = true;
    try {
      const db = await this.ensureDb();
      if (!db) return;
      const result = await runRagFtsRebuild({ db: db.db, trigger });
      this.opts.logger.info(logPrefix(`completed`), {
        trigger,
        status: result.status,
        processed: result.processed,
      });
    } catch (error) {
      this.opts.logger.error(logPrefix('crashed'), error);
    } finally {
      this.running = false;
    }
  }
}
