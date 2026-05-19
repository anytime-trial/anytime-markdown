import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

type AnalyzeReleaseFn = NonNullable<Parameters<TrailDatabase['importAll']>[3]>;

export interface CodeGraphBuilderOptions {
  readonly trailDb: TrailDatabase;
  /** 監視対象 gitRoot 群。`gitRoots[0]` を primary とみなす */
  readonly gitRoots: readonly string[];
  /** release コード解析関数 (trail-core の analyze)。未指定なら release codegraph は生成しない */
  readonly analyzeFn?: AnalyzeReleaseFn;
  /** analyze から除外するディレクトリパターン (省略時は trail-db デフォルト) */
  readonly excludePatterns?: readonly string[];
  readonly onPhase?: (event: ImportAllPhaseEvent) => void;
  readonly onProgress?: (message: string, increment?: number) => void;
}

/**
 * Layer 2 Primary Analyzer (inputMode='self-read'): release tag ごとの code graph を構築する。
 *
 * 既存 importAll Phase 3 (`analyze_releases`) と等価。`TrailDatabase.analyzeReleases()` は
 * 内部で「未解析タグのみ git worktree を立てて analyzeFn 実行 → saveReleaseGraph」を行い、
 * 解析済みタグは skip するため、Wave 末端で 1 回呼べば十分 (event ごとの再実行は不要)。
 *
 * `release_resolved` を subscribes に列挙しているのは「release 解決が走った run」を識別する
 * ためだが、analyzeReleases 自体が冪等なので onRunEnd で無条件に 1 回呼ぶ。
 *
 * `code_graph_built` event の emit は Step 3 (DriftDetector 連携) で analyzeReleases を
 * per-tag 結果返却にリファクタした後に対応する。現状は emit しない。
 */
export class CodeGraphBuilder implements Analyzer {
  readonly id = 'CodeGraphBuilder';
  readonly tier = 2 as const;
  readonly inputMode = 'self-read' as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['release_resolved'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private releasesAnalyzed = 0;
  private resolvedCount = 0;

  constructor(private readonly opts: CodeGraphBuilderOptions) {}

  getReleasesAnalyzed(): number {
    return this.releasesAnalyzed;
  }

  async onRunStart(_ctx: AnalyzerContext): Promise<void> {
    this.releasesAnalyzed = 0;
    this.resolvedCount = 0;
  }

  async onEvent(e: AnalyzerEvent, _ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'release_resolved') return;
    this.resolvedCount += 1;
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    const gitRoot = this.opts.gitRoots[0];
    if (!gitRoot || !this.opts.analyzeFn) {
      this.opts.onPhase?.({
        phase: 'analyze_releases',
        action: 'skip',
        message: gitRoot ? 'no analyzeFn' : 'no gitRoot',
      });
      ctx.logger.info(
        `[CodeGraphBuilder] done (skip: ${gitRoot ? 'no analyzeFn' : 'no gitRoot'})`,
      );
      return;
    }

    this.opts.onPhase?.({ phase: 'analyze_releases', action: 'start' });
    try {
      this.opts.onProgress?.('Analyzing releases...', 0);
      this.releasesAnalyzed = this.opts.trailDb.analyzeReleases(
        gitRoot,
        this.opts.analyzeFn,
        (msg: string) => this.opts.onProgress?.(msg, 0),
        this.opts.excludePatterns,
      );
      this.opts.onProgress?.(`Releases analyzed: ${this.releasesAnalyzed}`, 0);
      this.opts.onPhase?.({
        phase: 'analyze_releases',
        action: 'finish',
        count: this.releasesAnalyzed,
      });
      ctx.logger.info(
        `[CodeGraphBuilder] done (resolved=${this.resolvedCount}, analyzed=${this.releasesAnalyzed})`,
      );
    } catch (err) {
      this.opts.onPhase?.({
        phase: 'analyze_releases',
        action: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      ctx.logger.error(
        `[CodeGraphBuilder] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
