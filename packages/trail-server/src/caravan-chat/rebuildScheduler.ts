import type { Disposable } from '../runtime/Disposable';
import {
  openCaravanBookDb,
  runRagFtsRebuild,
  type CaravanBookDb,
} from '@anytime-markdown/trail-caravan-book';
import type { CaravanChatLogger } from './types';

/**
 * @deprecated Use CaravanChatLogger directly. Retained for backwards compat with external callers.
 */
export type RebuildSchedulerLogger = CaravanChatLogger;

export interface RebuildSchedulerOptions {
  readonly caravanDbPath: string;
  readonly caravanNativeBinding?: string;
  readonly logger: CaravanChatLogger;
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
 * 同時実行は内部の `running` フラグで防止する。trail-caravan-book 側にも
 * pipeline_state による CAS があるため二重実行は問題ないが、無駄な DB open を避ける。
 */
export class RebuildScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private caravanDb: CaravanBookDb | undefined;

  constructor(private readonly opts: RebuildSchedulerOptions) {}

  start(intervalMs: number): Disposable {
    // caravanBookRunner などの他コンシューマが activate 直後に同じ
    // caravan-book.db を開いて migration を走らせるため、startup tick は
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
          this.caravanDb?.close();
        } catch (error) {
          this.opts.logger.error('caravanDb close failed', error);
        }
        this.caravanDb = undefined;
      },
    };
  }

  async runManual(): Promise<void> {
    await this.tick('manual');
  }

  private async ensureDb(): Promise<CaravanBookDb | null> {
    if (this.caravanDb) return this.caravanDb;
    try {
      this.caravanDb = await openCaravanBookDb(this.opts.caravanDbPath, {
        nativeBinding: this.opts.caravanNativeBinding,
      });
      return this.caravanDb;
    } catch (error) {
      this.opts.logger.error(logPrefix('failed to open caravan-book DB'), error);
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
