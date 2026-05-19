import * as path from 'node:path';

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

export interface ReleaseResolverOptions {
  readonly trailDb: TrailDatabase;
  /** 監視対象 gitRoot 群 (各 root で resolveReleases を実行)。`gitRoots[0]` を primary とみなす */
  readonly gitRoots: readonly string[];
  /** Pipelines TreeView 用 phase event */
  readonly onPhase?: (event: ImportAllPhaseEvent) => void;
  /** UI 進捗用 */
  readonly onProgress?: (message: string, increment?: number) => void;
}

/**
 * Layer 2 Primary Analyzer: `git_tag` event を購読して `TrailDatabase.resolveReleases()` /
 * `resolveReleaseTimes()` を呼ぶ。
 *
 * 設計上のポイント:
 * - 既存 importAll の Phase 2 は `gitRoot` 単位で `resolveReleases` を 1 回呼んで全 tag を処理。
 *   LEP では `git_tag` event ごとに発火するため、同じ gitRoot に対する重複呼出を避ける
 *   ためのデバウンスを `pendingRoots` で管理する。
 * - Wave 末端の `onRunEnd` で resolveReleases を 1 回 / gitRoot だけ実行し、
 *   各 release tag について `release_resolved` event を emit する。
 */
export class ReleaseResolver implements Analyzer {
  readonly id = 'ReleaseResolver';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['git_tag'];
  readonly emits: readonly AnalyzerEvent['kind'][] = ['release_resolved'];

  /** event 経由で参照された tag を gitRoot ごとに収集 */
  private readonly tagsByRoot = new Map<string, Set<string>>();
  private releasesResolved = 0;

  constructor(private readonly opts: ReleaseResolverOptions) {}

  getReleasesResolved(): number {
    return this.releasesResolved;
  }

  async onRunStart(_ctx: AnalyzerContext): Promise<void> {
    this.tagsByRoot.clear();
    this.releasesResolved = 0;
  }

  async onEvent(e: AnalyzerEvent, _ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'git_tag') return;
    // primary gitRoot (gitRoots[0]) のみ resolveReleases を呼ぶ既存挙動を維持
    const primary = this.opts.gitRoots[0];
    if (!primary) return;
    // event の `repo` は basename。primary repoName とマッチするものだけ採用
    if (path.basename(primary) !== e.repo) return;
    let set = this.tagsByRoot.get(primary);
    if (!set) {
      set = new Set();
      this.tagsByRoot.set(primary, set);
    }
    set.add(e.tag);
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    const primary = this.opts.gitRoots[0];
    if (!primary) {
      this.opts.onPhase?.({ phase: 'resolve_releases', action: 'skip', message: 'no gitRoot' });
      ctx.logger.info('[ReleaseResolver] done (skip: no gitRoot)');
      return;
    }
    if (this.tagsByRoot.size === 0) {
      this.opts.onPhase?.({ phase: 'resolve_releases', action: 'skip', message: 'no tags' });
      ctx.logger.info('[ReleaseResolver] done (skip: no tags)');
      return;
    }

    this.opts.onPhase?.({ phase: 'resolve_releases', action: 'start' });
    let failed = false;
    try {
      this.opts.onProgress?.('Resolving releases from version tags...', 0);
      this.releasesResolved = this.opts.trailDb.resolveReleases(primary);
      this.opts.onProgress?.(`Releases resolved: ${this.releasesResolved}`, 0);
    } catch (err) {
      failed = true;
      this.opts.onPhase?.({
        phase: 'resolve_releases',
        action: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      this.opts.onProgress?.('Resolving release times...', 0);
      const timesResolved = this.opts.trailDb.resolveReleaseTimes();
      this.opts.onProgress?.(`Release times resolved: ${timesResolved}`, 0);
    } catch (err) {
      if (!failed) {
        this.opts.onPhase?.({
          phase: 'resolve_releases',
          action: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
        failed = true;
      }
    }
    if (!failed) {
      this.opts.onPhase?.({
        phase: 'resolve_releases',
        action: 'finish',
        count: this.releasesResolved,
      });
    }

    // 各 tag について release_resolved を emit (releasedAt は trail.db 由来でも良いが、
    // 取得 API が無いため空文字。Step 2c の CodeGraphBuilder は tag のみ参照する)
    const set = this.tagsByRoot.get(primary);
    if (set) {
      for (const tag of set) {
        await ctx.bus.publish({
          kind: 'release_resolved',
          tag,
          releasedAt: '',
        });
      }
    }
    ctx.logger.info(`[ReleaseResolver] done (releases=${this.releasesResolved})`);
  }
}
