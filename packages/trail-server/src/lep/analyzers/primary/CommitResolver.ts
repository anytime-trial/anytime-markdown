import * as path from 'node:path';

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

export interface CommitResolverOptions {
  readonly trailDb: TrailDatabase;
  /** 監視対象 gitRoot 群 (各 root に対して resolveCommits を実行) */
  readonly gitRoots: readonly string[];
}

/**
 * Layer 2 Primary Analyzer: `session_imported` / `session_skipped` を購読し、
 * 各 watched gitRoot に対して `TrailDatabase.resolveCommits()` を呼ぶ。
 *
 * 既存 Phase 1 内の resolveCommits ループ (importAll の本体内) を独立した analyzer に分離。
 * 解決済み (isCommitResolutionDone) のセッション × repo はスキップ。
 *
 * 動作不変ポイント:
 * - `session_imported` だけでなく `session_skipped` でも resolveCommits を試行 (skip された session
 *   でも、過去 run 時点で resolveCommits 未実行ならここで補完)。
 */
export class CommitResolver implements Analyzer {
  readonly id = 'CommitResolver';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['session_imported', 'session_skipped'];
  readonly emits: readonly AnalyzerEvent['kind'][] = ['commit_resolved'];

  private commitsResolved = 0;
  private readonly watched: readonly { gitRoot: string; repoName: string }[];

  constructor(private readonly opts: CommitResolverOptions) {
    this.watched = opts.gitRoots.map((r) => ({ gitRoot: r, repoName: path.basename(r) }));
  }

  /** 当該 run で解決された commit 件数 (累計) */
  getCommitsResolved(): number {
    return this.commitsResolved;
  }

  async onRunStart(_ctx: AnalyzerContext): Promise<void> {
    this.commitsResolved = 0;
  }

  async onEvent(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'session_imported' && e.kind !== 'session_skipped') return;
    const sessionId = e.sessionId;
    const allHashes: string[] = [];
    for (const w of this.watched) {
      if (this.opts.trailDb.isCommitResolutionDone(sessionId, w.repoName)) continue;
      try {
        const n = this.opts.trailDb.resolveCommits(sessionId, w.gitRoot, w.repoName);
        this.commitsResolved += n;
        // resolveCommits の戻り値は INSERT 件数。ハッシュ集合の取得は trail.db の別 API が
        // 必要なので、event の `hashes` は概算 (件数だけ) として空配列で残す。下流の
        // MessageCommitMatcher (Step 2d) では session_commits テーブルを直接読むため、
        // hashes の正確性はここで必須ではない。
      } catch (err) {
        ctx.logger.error(
          `[CommitResolver] resolveCommits failed: sid=${sessionId} repo=${w.repoName} (${
            err instanceof Error ? err.message : String(err)
          })`,
        );
      }
    }

    // emit per session × repo グルーピング後の集約 (1 session につき 1 event)
    if (this.watched.length > 0) {
      const repoName = this.watched[0].repoName;
      await ctx.bus.publish({
        kind: 'commit_resolved',
        sessionId,
        repoName,
        hashes: allHashes,
      });
    }
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    ctx.logger.info(`[CommitResolver] done (resolved=${this.commitsResolved})`);
  }
}
