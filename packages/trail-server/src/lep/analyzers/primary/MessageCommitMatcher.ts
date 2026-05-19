import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

export interface MessageCommitMatcherOptions {
  readonly trailDb: TrailDatabase;
  readonly onProgress?: (message: string, increment?: number) => void;
}

/**
 * Layer 2 Primary Analyzer: `commit_resolved` を購読し、Wave 末端で
 * `TrailDatabase.backfillMessageCommits()` を 1 回呼ぶ。
 *
 * 既存 importAll Phase 8 の message_commits backfill と等価。
 * `message_commits_resolved_at` が NULL のセッションのみ処理するため Wave 末端 1 回で冪等。
 *
 * 既存挙動同様、個別セッションの失敗は backfillMessageCommits 内でログのみ (非致命的)。
 */
export class MessageCommitMatcher implements Analyzer {
  readonly id = 'MessageCommitMatcher';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['commit_resolved'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private resolvedCount = 0;
  private messageCommitsBackfilled = 0;

  constructor(private readonly opts: MessageCommitMatcherOptions) {}

  getMessageCommitsBackfilled(): number {
    return this.messageCommitsBackfilled;
  }

  async onRunStart(_ctx: AnalyzerContext): Promise<void> {
    this.resolvedCount = 0;
    this.messageCommitsBackfilled = 0;
  }

  async onEvent(e: AnalyzerEvent, _ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'commit_resolved') return;
    this.resolvedCount += 1;
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    try {
      this.opts.onProgress?.('Backfilling message_commits...', 0);
      this.messageCommitsBackfilled = this.opts.trailDb.backfillMessageCommits(
        (msg) => this.opts.onProgress?.(msg, 0),
      );
      ctx.logger.info(
        `[MessageCommitMatcher] done (resolved events=${this.resolvedCount}, backfilled=${this.messageCommitsBackfilled})`,
      );
    } catch (err) {
      ctx.logger.error(
        `[MessageCommitMatcher] failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
