import type { RunReason } from '../runner/types';

/**
 * Layered Event Pipeline (LEP) のイベント型ユニオン。
 *
 * Step 1 では最小サブセットとして Wave barrier event のみを定義する。
 * Step 2 以降で `session_imported` / `git_commit_resolved` 等の実 event 種別を追加予定。
 *
 * - `wave_complete`: Wave (sources/primary/memory/derived) の全 analyzer 実行が完了した
 * - `wave_skipped`:  Wave がスキップされた (例: memory-core が disabled)
 */
export type AnalyzerEvent =
  | { kind: 'wave_complete'; wave: 'sources' | 'primary' | 'memory' | 'derived' }
  | { kind: 'wave_skipped'; wave: 'sources' | 'primary' | 'memory' | 'derived'; reason: string };

/**
 * EventBus 発行口。Analyzer は `ctx.bus.publish()` でイベントを発火する。
 *
 * Step 1 では Promise<void> を返す async 契約とし、subscriber の onEvent
 * (importAll 失敗時の memory-core 後続実行など) を完走させるための await を可能にする。
 */
export interface EventBusPublisher {
  publish(e: AnalyzerEvent): Promise<void>;
}

/**
 * 1 回の runOnce で全 analyzer に渡される実行コンテキスト。
 */
export interface AnalyzerContext {
  /** この run の一意 ID (UUID v4 想定) */
  readonly runId: string;
  /** runOnce を起動した契機 (RunReason: manual / startup / periodic / import) */
  readonly reason: RunReason;
  /** ログ出力口 (analyzer ID プレフィックスは呼び出し側で付与) */
  readonly logger: {
    info: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
  };
  /** イベント発行口。新規 event を pub する場合に使用 */
  readonly bus: EventBusPublisher;
}

/**
 * LEP の最小 Analyzer インターフェイス。
 *
 * - `tier=1` (sources): JSONL / git log 等の生データ ingest
 * - `tier=2` (primary): codegraph / commit resolver 等の primary 派生
 * - `tier=3` (memory):  memory-core ingest pipeline
 * - `tier=4` (derived): 集計・サマリ等 (Step 4 以降)
 *
 * - `subscribes`: 受信する event 種別
 * - `emits`:      発火する event 種別 (任意, ドキュメント用途)
 * - `onRunStart`: 1 run の冒頭で 1 回呼ばれる
 * - `onRunEnd`:   tier loop で 1 回呼ばれる (tier 順次実行)
 * - `onEvent`:    subscribes のいずれかが publish された時に呼ばれる
 */
export interface Analyzer {
  readonly id: string;
  readonly tier: 1 | 2 | 3 | 4;
  readonly subscribes: readonly AnalyzerEvent['kind'][];
  readonly emits?: readonly AnalyzerEvent['kind'][];

  onRunStart?(ctx: AnalyzerContext): Promise<void>;
  onRunEnd?(ctx: AnalyzerContext): Promise<void>;
  onEvent?(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void>;
}
