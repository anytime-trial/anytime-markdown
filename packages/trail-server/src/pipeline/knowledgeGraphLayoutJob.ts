import { openCaravanBookDb, type CaravanBookDb } from '@anytime-markdown/trail-caravan-book';
import type { JobResult, ScheduledJob } from '../runtime/DaemonScheduler';
import type { Logger } from '../runtime/Logger';
import { runKnowledgeGraphLayout } from './runKnowledgeGraphLayout';

export const KNOWLEDGE_GRAPH_LAYOUT_JOB_ID = 'knowledgeGraphLayout';

/** 既定の実行間隔。FTS 全再構築（RebuildScheduler）と同じ 60 分。 */
export const DEFAULT_KNOWLEDGE_GRAPH_LAYOUT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 既定の起動遅延。RebuildScheduler の 10 秒より後ろへ置く。
 *
 * activate 直後は caravanBookRunner / LogService が同じ caravan-book.db を開いて
 * migration を流すため、書き込みを伴う本 job を同時刻に重ねない。
 */
export const DEFAULT_KNOWLEDGE_GRAPH_LAYOUT_STARTUP_DELAY_MS = 30 * 1000;

type OpenCaravanBookDbFn = (
  filePath: string,
  options: { nativeBinding?: string },
) => Promise<CaravanBookDb>;

export interface KnowledgeGraphLayoutJobOptions {
  readonly caravanDbPath: string;
  readonly caravanNativeBinding?: string;
  /** 実行間隔（ミリ秒）。0 は DaemonScheduler 側で「無効」として扱われる。 */
  readonly intervalMs?: number;
  readonly startupDelayMs?: number;
  readonly logger: Logger;
  /** テストシーム: caravan-book.db を開く関数。 */
  readonly openDb?: OpenCaravanBookDbFn;
  /** テストシーム: `recorded_at` に書く時刻。 */
  readonly now?: () => Date;
}

export interface KnowledgeGraphLayoutJobHandle {
  readonly job: ScheduledJob;
  /** 保持している書き込み接続を閉じる。daemon 停止時に呼ぶ。 */
  dispose(): void;
}

function toJobStatus(status: 'success' | 'skipped' | 'error'): JobResult['status'] {
  if (status === 'success') return 'ok';
  return status === 'skipped' ? 'skipped' : 'error';
}

/**
 * 知識グラフ全体の座標を定期的に事前計算する {@link ScheduledJob} を作る。
 *
 * 書き込み接続は初回実行で開いて使い回す（毎回開き直すと migration runner が毎時走り、
 * 他コンシューマの書き込みロックと競合する）。開けなかった場合は例外を投げ、
 * DaemonScheduler の `failed` ログに残す — 座標が無いまま静かに配信され続けるのを避ける。
 *
 * ForceAtlas2 は同期実行で、実測 25,000 ノードで約 15 秒・100,000 ノードで約 73 秒かかる。
 * その間 daemon プロセスは他の要求を処理できないが、これは同プロセスで動く解析パイプラインと
 * 同じ性質であり、拡張ホスト（UI）は別プロセスのため固まらない。
 */
export function createKnowledgeGraphLayoutJob(
  opts: KnowledgeGraphLayoutJobOptions,
): KnowledgeGraphLayoutJobHandle {
  const openDb: OpenCaravanBookDbFn = opts.openDb ?? openCaravanBookDb;
  const logger = opts.logger;
  let handle: CaravanBookDb | null = null;
  let disposed = false;

  const run = async (): Promise<JobResult> => {
    if (disposed) {
      return { status: 'skipped', durationMs: 0, message: 'disposed' };
    }
    if (!handle) {
      handle = await openDb(opts.caravanDbPath, { nativeBinding: opts.caravanNativeBinding });
    }
    const result = runKnowledgeGraphLayout({
      db: handle.db,
      recordedAt: (opts.now?.() ?? new Date()).toISOString(),
      logger,
    });
    return {
      status: toJobStatus(result.status),
      durationMs: result.duration_ms,
      message: result.detail === '' ? undefined : result.detail,
      metrics: {
        nodes: result.nodes,
        edges: result.edges,
        communities: result.communities,
      },
    };
  };

  return {
    job: {
      id: KNOWLEDGE_GRAPH_LAYOUT_JOB_ID,
      intervalMs: opts.intervalMs ?? DEFAULT_KNOWLEDGE_GRAPH_LAYOUT_INTERVAL_MS,
      startupDelayMs: opts.startupDelayMs ?? DEFAULT_KNOWLEDGE_GRAPH_LAYOUT_STARTUP_DELAY_MS,
      runOnStart: true,
      run,
    },
    dispose: () => {
      disposed = true;
      if (!handle) return;
      try {
        handle.close();
      } catch (error) {
        logger.error('[knowledge-graph-layout] caravan-book.db close failed', error);
      }
      handle = null;
    },
  };
}
