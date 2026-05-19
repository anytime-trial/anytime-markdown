import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

export interface CommitFilesBackfillerOptions {
  readonly trailDb: TrailDatabase;
  /** 監視対象 gitRoot 群。`gitRoots[0]` を primary とみなす */
  readonly gitRoots: readonly string[];
  readonly onProgress?: (message: string, increment?: number) => void;
}

/**
 * Layer 2 Primary Analyzer: `commit_resolved` を購読し、Wave 末端で
 * `TrailDatabase.backfillCommitFilesPublic(gitRoot)` を 1 回呼ぶ。
 *
 * 既存 importAll Phase 8 の commit_files backfill と等価。
 * `_migrations.commit_files_backfill_v2` フラグで一度きり実行が保証されるため、
 * Wave 末端で無条件に呼んでも冪等。
 */
export class CommitFilesBackfiller implements Analyzer {
  readonly id = 'CommitFilesBackfiller';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['commit_resolved'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private resolvedCount = 0;

  constructor(private readonly opts: CommitFilesBackfillerOptions) {}

  async onRunStart(_ctx: AnalyzerContext): Promise<void> {
    this.resolvedCount = 0;
  }

  async onEvent(e: AnalyzerEvent, _ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'commit_resolved') return;
    this.resolvedCount += 1;
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    const gitRoot = this.opts.gitRoots[0];
    if (!gitRoot) {
      ctx.logger.info('[CommitFilesBackfiller] done (skip: no gitRoot)');
      return;
    }
    // 既存 Phase 8 では backfill 失敗は非致命的 (importAll は throw せず継続) だったため、
    // ここでも throw せずログのみ。
    try {
      this.opts.trailDb.backfillCommitFilesPublic(gitRoot, (msg) => this.opts.onProgress?.(msg, 0));
      ctx.logger.info(`[CommitFilesBackfiller] done (resolved events=${this.resolvedCount})`);
    } catch (err) {
      ctx.logger.error(
        `[CommitFilesBackfiller] failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
