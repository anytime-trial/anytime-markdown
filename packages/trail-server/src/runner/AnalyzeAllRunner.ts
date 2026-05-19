import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import {
  BaseRunner,
  EventBus,
  LepOrchestrator,
  type MemoryCoreService,
  type RunReason,
  type RunnerLogSink,
  type Analyzer,
  getTrailHome,
} from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

import { ImportAllLegacyAnalyzer } from '../lep/ImportAllLegacyAnalyzer';
import { MemoryCoreLegacyAnalyzer } from '../lep/MemoryCoreLegacyAnalyzer';
import { BehaviorAnalyzer } from '../lep/analyzers/primary/BehaviorAnalyzer';
import { CommitResolver } from '../lep/analyzers/primary/CommitResolver';
import { CostRebuilder } from '../lep/analyzers/primary/CostRebuilder';
import { CountsRebuilder } from '../lep/analyzers/primary/CountsRebuilder';
import { CoverageImporter } from '../lep/analyzers/primary/CoverageImporter';
import { ReleaseResolver } from '../lep/analyzers/primary/ReleaseResolver';
import { SessionImporter } from '../lep/analyzers/primary/SessionImporter';
import { CoverageIngester } from '../lep/ingesters/CoverageIngester';
import { GitIngester } from '../lep/ingesters/GitIngester';
import { JsonlIngester } from '../lep/ingesters/JsonlIngester';
import { MetaJsonIngester } from '../lep/ingesters/MetaJsonIngester';

// TrailDatabase.importAll の 4 番目の引数 (AnalyzeFunction) を再利用する。
// trail-db で named export されていないため、メソッドシグネチャから抽出する。
type ImportAllAnalyzeFn = NonNullable<Parameters<TrailDatabase['importAll']>[3]>;
type ImportAllResult = Awaited<ReturnType<TrailDatabase['importAll']>>;

export interface AnalyzeAllRunnerOptions {
  /** ログ書き込み先 (拡張: OutputChannel, daemon: Logger ラッパ) */
  logSink: RunnerLogSink;
  /** state ファイル絶対パス (省略時はデフォルト: $TRAIL_HOME/analyze-all-runner.json) */
  statePath?: string;
  /** Git working tree ルート (defaultStatePath のフォールバックで使用) */
  gitRoot?: string;
  /** importAll を実行する trail.db ハンドル (省略時は importAll をスキップ) */
  trailDb?: TrailDatabase;
  /** importAll の gitRoots 引数に渡す監視対象ルート集合 */
  gitRoots?: readonly string[];
  /** memory-core ingest pipeline を実行する service (省略時は memory-core ステップをスキップ) */
  memoryCoreService?: MemoryCoreService;
  /**
   * 指定時、importAll の per-phase 進捗を JSON ファイルに書き出す
   * (VS Code 拡張 OllamaProvider が polling して per-phase 表示を更新するため)。
   */
  importAllStatusFilePath?: string;

  // -- Optional callback hooks (拡張モードでの UI 統合用) --
  /** importAll の onProgress に渡される。ログ・進捗バー更新等。 */
  onImportProgress?: (message: string, increment?: number) => void;
  /** importAll の analyzeFn (release coverage 等)。省略時は trail-db デフォルト挙動。 */
  analyzeReleaseFn?: ImportAllAnalyzeFn;
  /**
   * importAll の各 phase イベントに対するカスタムハンドラ (UI 進捗等)。
   * importAllStatusFilePath と独立に呼ばれる (両方設定時は両方発火)。
   */
  onImportPhase?: (event: ImportAllPhaseEvent) => void;
  /** 1 run 終了時 (成功・失敗を問わず) に呼ばれるフック (UI 更新通知用) */
  onAfterRun?: () => void;

  /**
   * Step 2a で追加された Layer 1 Ingester (Jsonl/Git/Coverage/MetaJson) を登録するか。
   * Step 2b 以降は Layer 2 の SessionImporter / CommitResolver / ReleaseResolver / CoverageImporter
   * とも紐付くため、有効化すると 4 analyzer が連動する。デフォルト `true`。
   */
  enableIngesters?: boolean;
}

/**
 * analyzeAll パイプライン (importAll → memory-core runOnce) の唯一の orchestrator。
 *
 * BaseRunner を継承し、pause/resume/state/ticks/lastRunAt を一元管理する。
 * MemoryCoreService は内部実行ユニットとしてのみ利用され、その pause API は
 * このリファクタ以降 user-facing には公開されない (CLI / HTTP / VS Code コマンド
 * は全て AnalyzeAllRunner を介する)。
 *
 * 内部実装 (Step 2b 以降): LepOrchestrator に委譲する薄い層。
 * - Layer 1 (sources): 4 種 Ingester (`Jsonl/Git/Coverage/MetaJson`) が `onRunStart` で event 発火
 * - Layer 2 (primary):
 *   - `SessionImporter`     ← jsonl_session_discovered (Phase 1)
 *   - `CommitResolver`      ← session_imported / session_skipped (Phase 1 内 resolveCommits)
 *   - `ReleaseResolver`     ← git_tag (Phase 2)
 *   - `CoverageImporter`    ← coverage_report (Phase 4)
 *   - `ImportAllLegacyAnalyzer` (Phase 3/5/6/7/8 を担当、Phase 1/2/4 は skip)
 * - Layer 3 (memory):  `MemoryCoreLegacyAnalyzer` が wave_complete:primary に応答して memory-core を実行
 *
 * エラーハンドリングは LepOrchestrator が analyzer.id 別に errors を収集し、
 * AnalyzeAllRunner 側で importError / memError を従来同様の合算メッセージに組み立てる。
 *
 * - 拡張モードでは onImportProgress / analyzeReleaseFn / onImportPhase / onAfterRun
 *   を渡すことで UI 統合 (pipelineProvider 通知・notifySessionsUpdated 等) を実現する。
 */
export class AnalyzeAllRunner extends BaseRunner {
  private readonly importAnalyzer: ImportAllLegacyAnalyzer | null;
  private readonly memoryAnalyzer: MemoryCoreLegacyAnalyzer | null;
  private readonly orchestrator: LepOrchestrator;
  private readonly onAfterRun: (() => void) | undefined;

  constructor(opts: AnalyzeAllRunnerOptions) {
    super({
      logSink: opts.logSink,
      logTag: 'anytime-analyze-all',
      statePath: opts.statePath ?? defaultAnalyzeAllStatePath(opts.gitRoot),
    });

    const bus = new EventBus();
    const analyzers: Analyzer[] = [];
    const ingestersEnabled = opts.enableIngesters !== false;

    // Layer 1 (sources)
    if (ingestersEnabled) {
      const ingesters = buildIngesters(opts);
      analyzers.push(...ingesters);
    }

    // Layer 2 (primary) — Step 2b/2c の primary analyzer は trailDb が必須
    let sessionImporter: SessionImporter | null = null;
    let commitResolver: CommitResolver | null = null;
    let releaseResolver: ReleaseResolver | null = null;
    let coverageImporter: CoverageImporter | null = null;
    let costRebuilder: CostRebuilder | null = null;
    let behaviorAnalyzer: BehaviorAnalyzer | null = null;
    let countsRebuilder: CountsRebuilder | null = null;
    if (opts.trailDb && ingestersEnabled) {
      sessionImporter = new SessionImporter({
        trailDb: opts.trailDb,
        onProgress: opts.onImportProgress,
        onPhase: opts.onImportPhase,
      });
      commitResolver = new CommitResolver({
        trailDb: opts.trailDb,
        gitRoots: opts.gitRoots ?? [],
      });
      releaseResolver = new ReleaseResolver({
        trailDb: opts.trailDb,
        gitRoots: opts.gitRoots ?? [],
        onPhase: opts.onImportPhase,
        onProgress: opts.onImportProgress,
      });
      coverageImporter = new CoverageImporter({
        trailDb: opts.trailDb,
        gitRoots: opts.gitRoots ?? [],
        onPhase: opts.onImportPhase,
        onProgress: opts.onImportProgress,
      });
      costRebuilder = new CostRebuilder({
        trailDb: opts.trailDb,
        onPhase: opts.onImportPhase,
        onProgress: opts.onImportProgress,
      });
      behaviorAnalyzer = new BehaviorAnalyzer({
        trailDb: opts.trailDb,
        onPhase: opts.onImportPhase,
        onProgress: opts.onImportProgress,
      });
      countsRebuilder = new CountsRebuilder({
        trailDb: opts.trailDb,
        onPhase: opts.onImportPhase,
        onProgress: opts.onImportProgress,
      });
      bus.subscribe(sessionImporter);
      bus.subscribe(commitResolver);
      bus.subscribe(releaseResolver);
      bus.subscribe(coverageImporter);
      bus.subscribe(costRebuilder);
      bus.subscribe(behaviorAnalyzer);
      // CountsRebuilder は subscribe 不要 (onRunEnd のみ)
      analyzers.push(
        sessionImporter,
        commitResolver,
        releaseResolver,
        coverageImporter,
        costRebuilder,
        behaviorAnalyzer,
        countsRebuilder,
      );
    }

    this.importAnalyzer = opts.trailDb
      ? new ImportAllLegacyAnalyzer({
          trailDb: opts.trailDb,
          gitRoots: opts.gitRoots ?? [],
          onImportProgress: opts.onImportProgress,
          analyzeReleaseFn: opts.analyzeReleaseFn,
          onImportPhase: opts.onImportPhase,
          importAllStatusFilePath: opts.importAllStatusFilePath,
          sessionImporter: sessionImporter ?? undefined,
          commitResolver: commitResolver ?? undefined,
          releaseResolver: releaseResolver ?? undefined,
          coverageImporter: coverageImporter ?? undefined,
          costRebuilder: costRebuilder ?? undefined,
          behaviorAnalyzer: behaviorAnalyzer ?? undefined,
          countsRebuilder: countsRebuilder ?? undefined,
        })
      : null;
    if (this.importAnalyzer) analyzers.push(this.importAnalyzer);

    this.memoryAnalyzer = opts.memoryCoreService
      ? new MemoryCoreLegacyAnalyzer(opts.memoryCoreService)
      : null;
    if (this.memoryAnalyzer) {
      bus.subscribe(this.memoryAnalyzer);
      analyzers.push(this.memoryAnalyzer);
    }

    this.orchestrator = new LepOrchestrator(bus, analyzers, {
      info: (msg) => this.log(msg),
      error: (msg) => this.log(`[ERROR] ${msg}`),
    });

    this.onAfterRun = opts.onAfterRun;
  }

  protected override async runImpl(reason: RunReason): Promise<void> {
    let runError: Error | null = null;

    try {
      const result = await this.orchestrator.runOnce({ runId: randomUUID(), reason });
      const importError = result.errors.get('ImportAllLegacy') ?? null;
      const memError = result.errors.get('MemoryCoreLegacy') ?? null;

      if (importError) {
        this.log(`[ERROR] importAll failed: ${importError.message}`);
      }

      if (importError && memError) {
        runError = new Error(`importAll: ${importError.message}; memory-core: ${memError.message}`);
      } else if (importError) {
        runError = importError;
      } else if (memError) {
        runError = new Error(`memory-core: ${memError.message}`);
      }
    } finally {
      // 成功・失敗を問わず通知 (UI 更新)。例外吸収して runImpl の throw を妨げない。
      try {
        this.onAfterRun?.();
      } catch (err) {
        this.log(`[WARN] onAfterRun callback failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (runError) throw runError;
  }

  /**
   * 直近 `runImpl` で実行した importAll の結果。失敗時 (例外発生) は更新されず、
   * 前回成功時の値が残る。trailDb 未設定時は常に null。
   */
  getLastImportResult(): ImportAllResult | null {
    return this.importAnalyzer?.getLastResult() ?? null;
  }
}

/**
 * 4 種 Ingester (Jsonl / Git / Coverage / MetaJson) を build する。
 *
 * gitRoots が空の場合でも JsonlIngester / MetaJsonIngester は ~/.claude を見るため
 * 動作する。GitIngester / CoverageIngester は gitRoots 配下を読むため、空の場合は
 * onRunStart 内で no-op となる。
 */
function buildIngesters(opts: AnalyzeAllRunnerOptions): readonly Analyzer[] {
  const gitRoots = opts.gitRoots ?? [];
  const primaryRepoName = opts.gitRoot
    ? extractBasename(opts.gitRoot)
    : gitRoots[0]
      ? extractBasename(gitRoots[0])
      : undefined;

  return [
    new JsonlIngester({
      gitRoot: opts.gitRoot ?? gitRoots[0],
      repoName: primaryRepoName,
    }),
    new GitIngester({ gitRoots }),
    new CoverageIngester({ gitRoots }),
    new MetaJsonIngester(),
  ];
}

function extractBasename(p: string): string {
  const trimmed = p.replace(/[/\\]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
}

/**
 * デフォルト state ファイルパス。
 * `$TRAIL_HOME/analyze-all-runner.json` を返す
 * (拡張: `<workspaceRoot>/.anytime/trail/analyze-all-runner.json`,
 *  daemon: `~/.anytime/trail/analyze-all-runner.json` 等)。
 */
export function defaultAnalyzeAllStatePath(workspaceRoot?: string): string {
  return join(getTrailHome(workspaceRoot), 'analyze-all-runner.json');
}
