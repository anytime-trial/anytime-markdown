import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';

import {
  BaseRunner,
  EventBus,
  LepOrchestrator,
  PipelineStatusWriter,
  PIPELINE_SCOPES,
  stageIncludesMemory,
  topoSortByDependsOn,
  type LepStage,
  type MemoryCoreService,
  type RunReason,
  type RunnerLogSink,
  type Analyzer,
  getTrailHome,
} from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

import {
  createMemoryAnalyzers,
  type MemoryWaveSessionProvider,
} from '../lep/analyzers/memory';
import { DoraMetricsAggregator, CrossSourceCorrelator } from '../lep/analyzers/aggregator';
import {
  PrReviewImporter,
  PrReviewFindingAnalyzer,
} from '../lep/analyzers/prreview';
import {
  GitHubPrReviewIngester,
  type GitRemoteReader,
} from '../lep/ingesters/GitHubPrReviewIngester';
import type { GitHubReviewClient } from '../lep/ingesters/github/GitHubReviewClient';
import type { LlmProviderAvailability } from '../lep/LlmAvailability';
import { BehaviorAnalyzer } from '../lep/analyzers/primary/BehaviorAnalyzer';
import { CodeGraphBuilder } from '../lep/analyzers/primary/CodeGraphBuilder';
import { CommitFilesBackfiller } from '../lep/analyzers/primary/CommitFilesBackfiller';
import { CommitResolver } from '../lep/analyzers/primary/CommitResolver';
import { CostRebuilder } from '../lep/analyzers/primary/CostRebuilder';
import { CountsRebuilder } from '../lep/analyzers/primary/CountsRebuilder';
import { CoverageImporter } from '../lep/analyzers/primary/CoverageImporter';
import { MessageCommitMatcher } from '../lep/analyzers/primary/MessageCommitMatcher';
import { PersistAnalyzer } from '../lep/analyzers/primary/PersistAnalyzer';
import { ReleaseResolver } from '../lep/analyzers/primary/ReleaseResolver';
import { SessionImporter } from '../lep/analyzers/primary/SessionImporter';
import { SubagentTypeBackfiller } from '../lep/analyzers/primary/SubagentTypeBackfiller';
import { CoverageIngester } from '../lep/ingesters/CoverageIngester';
import { GitIngester } from '../lep/ingesters/GitIngester';
import { JsonlIngester } from '../lep/ingesters/JsonlIngester';
import { MetaJsonIngester } from '../lep/ingesters/MetaJsonIngester';

// TrailDatabase.importAll の 4 番目の引数 (AnalyzeFunction) を再利用する。
// trail-db で named export されていないため、メソッドシグネチャから抽出する。
type ImportAllAnalyzeFn = NonNullable<Parameters<TrailDatabase['importAll']>[3]>;
type ImportAllResult = Awaited<ReturnType<TrailDatabase['importAll']>>;

/**
 * periodic（スケジュール）起動かつ gate が COOLING のときだけ true。
 * manual / import / startup 契機は常に実行する（ユーザー起点を阻害しない）。
 */
export function shouldDeferPeriodicRun(reason: RunReason, deferFn?: () => boolean): boolean {
  return reason === 'periodic' && deferFn?.() === true;
}

export interface AnalyzeAllRunnerOptions {
  /** ログ書き込み先 (拡張: OutputChannel, daemon: Logger ラッパ) */
  logSink: RunnerLogSink;
  /** state ファイル絶対パス (省略時はデフォルト: $TRAIL_HOME/analyze-all-runner.json) */
  statePath?: string;
  /** Git working tree ルート (defaultStatePath のフォールバックで使用) */
  gitRoot?: string;
  /** trail.db ハンドル (省略時は trail.db import パイプラインをスキップ) */
  trailDb?: TrailDatabase;
  /** 監視対象 gitRoot 集合 (commit / release / coverage / codegraph 解析対象) */
  gitRoots?: readonly string[];
  /**
   * Claude Code セッションログ (JSONL) の探索元 (lep.json `sources.claude.projectsDir`)。
   * 省略 / 空時は JsonlIngester 既定 (`os.homedir()/.claude/projects`)。
   */
  claudeProjectsDir?: string;
  /**
   * Codex セッションログ (rollout JSONL) の探索元 (lep.json `sources.codex.sessionsDir`)。
   * 省略 / 空時は JsonlIngester 既定 (`os.homedir()/.codex/sessions`)。
   */
  codexSessionsDir?: string;
  /** memory-core ingest pipeline を実行する service (省略時は memory-core ステップをスキップ) */
  memoryCoreService?: MemoryCoreService;
  /**
   * 実行する Wave 範囲を決める stage (設計書 9 章)。省略時 `'primary+memory'`
   * (旧 analyzeAll enabled=true 相当)。`disabled` なら何も実行しない。
   */
  stage?: LepStage;
  /**
   * Wave 3 開始前の LLM Pre-flight チェッカ。`memoryCoreService` 指定時のみ有効。
   * 省略時は LLM gating なし (全 memory analyzer を実行)。Ollama 不在時に LLM 依存 analyzer
   * (Conversation / Review / Spec / EmbeddingBackfill) を skip し、LLM 非依存 (Code /
   * BugHistory / Drift) は実行する。
   */
  checkLlmAvailability?: () => Promise<LlmProviderAvailability>;
  /** スキップ時ヒント用の Ollama baseUrl。 */
  ollamaBaseUrl?: string;
  /** lep.json で `enabled:false` の memory analyzer id。Wave 3 で登録・実行しない。 */
  disabledMemoryAnalyzers?: readonly string[];
  /**
   * lep.json で `enabled:false` の aggregator (Layer 4) analyzer id。Wave 4 で登録・実行しない。
   * 通常 `disabledMemoryAnalyzers` と同じ「全 disabled id」リストを渡してよい (id が一致した
   * aggregator のみ skip される)。tier 4 は stage=all 選択時のみ実行される (opt-in)。
   */
  disabledAggregators?: readonly string[];
  /**
   * lep.json で `enabled:false` の toggle 可能 Layer 2 (primary) analyzer id。
   * Wave 2 で登録・実行しない (ReleaseResolver / CoverageImporter / BehaviorAnalyzer /
   * CommitFilesBackfiller / SubagentTypeBackfiller / MessageCommitMatcher)。
   * 核 analyzer (SessionImporter / CommitResolver / CostRebuilder / CountsRebuilder /
   * PersistAnalyzer / CodeGraphBuilder) は本リストに id があっても無視され、常時登録される。
   * 通常 `disabledMemoryAnalyzers` と同じ「全 disabled id」リストを渡してよい。
   */
  disabledPrimaryAnalyzers?: readonly string[];
  /**
   * GitHub PR review source (Step 4b)。opt-in。指定時のみ `GitHubPrReviewIngester` を
   * Layer 1 に登録する。`client=null` (token なし) でも登録され、Ingester が skip ログを出す。
   * 未指定なら GitHub source は完全に無効で既存挙動は変わらない。
   */
  githubPrReview?: {
    client: GitHubReviewClient | null;
    gitRemoteReader?: GitRemoteReader;
    since?: string;
    maxPrs?: number;
  };
  /**
   * 指定時、import の per-phase 進捗を JSON ファイルに書き出す
   * (VS Code 拡張 OllamaProvider が polling して per-phase 表示を更新するため)。
   */
  importAllStatusFilePath?: string;
  /**
   * 指定時、stage が memory wave を含まない (Wave 3 を実行しない) run の終了時に
   * この pipeline-status.json の全 memory scope を `skipped` で記録する。
   * Wave 3 が走らないと status writer が初期化されず、UI が古い `running`/`pending` を
   * 表示し続けるのを防ぐ。memory wave を含む stage では Wave 3 側 writer に委ねるため書かない。
   */
  pipelineStatusFilePath?: string;

  /** スケジューラ gate。periodic run の起動時に COOLING なら true を返す。 */
  shouldDeferScheduled?: () => boolean;

  // -- Optional callback hooks (拡張モードでの UI 統合用) --
  /** import の onProgress に渡される。ログ・進捗バー更新等。 */
  onImportProgress?: (message: string, increment?: number) => void;
  /** release コード解析関数 (release codegraph 用)。省略時は release codegraph をスキップ。 */
  analyzeReleaseFn?: ImportAllAnalyzeFn;
  /**
   * import の各 phase イベントに対するカスタムハンドラ (UI 進捗等)。
   * importAllStatusFilePath と独立に呼ばれる (両方設定時は両方発火)。
   */
  onImportPhase?: (event: ImportAllPhaseEvent) => void;
  /** 1 run 終了時 (成功・失敗を問わず) に呼ばれるフック (UI 更新通知用) */
  onAfterRun?: () => void;

  /**
   * trail.db import パイプライン (Layer 1 Ingester + Layer 2 primary analyzer) を有効化するか。
   * デフォルト `true`。`false` の場合、trail.db への取込・解析を一切行わず memory-core ステップのみ実行する
   * (ファイル IO を避けたいテスト等)。
   */
  enableIngesters?: boolean;
}

/**
 * analyzeAll パイプライン (trail.db import → memory-core runOnce) の唯一の orchestrator。
 *
 * BaseRunner を継承し、pause/resume/state/ticks/lastRunAt を一元管理する。
 *
 * 内部実装 (Step 2d 以降): LepOrchestrator に委譲する。`ImportAllLegacyAnalyzer` は廃止され、
 * trail.db への取込・解析は全て個別の LEP analyzer が担う。
 *
 * - Layer 1 (sources): 4 種 Ingester (`Jsonl/Git/Coverage/MetaJson`) が `onRunStart` で event 発火
 * - Layer 2 (primary):
 *   - `SessionImporter`         ← jsonl_session_discovered (旧 Phase 1)
 *   - `CommitResolver`          ← session_imported / session_skipped (旧 Phase 1 内 resolveCommits)
 *   - `ReleaseResolver`         ← git_tag (旧 Phase 2)
 *   - `CodeGraphBuilder`        ← release_resolved / self-read (旧 Phase 3)
 *   - `CoverageImporter`        ← coverage_report (旧 Phase 4)
 *   - `CostRebuilder`           ← session_imported / Wave 末端 1 回 (旧 Phase 5)
 *   - `BehaviorAnalyzer`        ← session_imported (旧 Phase 6)
 *   - `CountsRebuilder`         ← Wave 末端 1 回 (旧 Phase 7)
 *   - `CommitFilesBackfiller`   ← commit_resolved (旧 Phase 8-A)
 *   - `SubagentTypeBackfiller`  ← meta_json / self-read (旧 Phase 8-B)
 *   - `MessageCommitMatcher`    ← commit_resolved (旧 Phase 8-C)
 * - Layer 3 (memory):  7 個の memory analyzer が `wave_start:memory` に応答して memory-core の
 *   各 scope を実行 (Conversation / Code / BugHistory / Review / Spec / Drift / EmbeddingBackfill)
 *
 * Wave 2 完了後に `trailDb.save()` を呼んで sql.js の in-memory DB をディスクへ永続化する
 * (旧 importAll() 末尾の save() の役割を引き継ぐ)。
 */
export class AnalyzeAllRunner extends BaseRunner {
  private readonly orchestrator: LepOrchestrator;
  private readonly onAfterRun: (() => void) | undefined;
  private readonly trailDb: TrailDatabase | undefined;
  private readonly importPipelineEnabled: boolean;
  private readonly pipelineStatusFilePath: string | undefined;
  private readonly shouldDeferScheduled: (() => boolean) | undefined;

  // Layer 3 (memory) analyzer (7 個) の error 集約に使う id 一覧。
  // Wave 3 完了後に provider.closeIfOpen() を呼ぶ。
  private readonly memoryAnalyzerIds: readonly string[];
  private readonly memorySessionProvider: MemoryWaveSessionProvider | null;
  private readonly stage: LepStage;
  /** 登録済み全 analyzer の id (toggle 反映後)。配線・無効化の検証用。 */
  private readonly registeredAnalyzerIds: readonly string[];

  // counter 集計用の analyzer 参照 (getLastImportResult で読む)
  private readonly sessionImporter: SessionImporter | null;
  private readonly commitResolver: CommitResolver | null;
  private readonly releaseResolver: ReleaseResolver | null;
  private readonly codeGraphBuilder: CodeGraphBuilder | null;
  private readonly coverageImporter: CoverageImporter | null;
  private readonly messageCommitMatcher: MessageCommitMatcher | null;

  private lastImportResult: ImportAllResult | null = null;

  constructor(opts: AnalyzeAllRunnerOptions) {
    super({
      logSink: opts.logSink,
      logTag: 'anytime-analyze-all',
      statePath: opts.statePath ?? defaultAnalyzeAllStatePath(opts.gitRoot),
    });

    const bus = new EventBus();
    const analyzers: Analyzer[] = [];
    const ingestersEnabled = opts.enableIngesters !== false;
    this.trailDb = opts.trailDb;
    this.importPipelineEnabled = Boolean(opts.trailDb) && ingestersEnabled;

    let sessionImporter: SessionImporter | null = null;
    let commitResolver: CommitResolver | null = null;
    let releaseResolver: ReleaseResolver | null = null;
    let codeGraphBuilder: CodeGraphBuilder | null = null;
    let coverageImporter: CoverageImporter | null = null;
    let messageCommitMatcher: MessageCommitMatcher | null = null;

    if (this.importPipelineEnabled && opts.trailDb) {
      const trailDb = opts.trailDb;
      const gitRoots = opts.gitRoots ?? [];
      const onPhase = opts.onImportPhase;
      const onProgress = opts.onImportProgress;
      const fallbackRepoName = gitRoots[0] ? basename(gitRoots[0]) : undefined;
      const primaryRepoName = opts.gitRoot ? basename(opts.gitRoot) : fallbackRepoName;

      // Layer 1 (sources)
      const ingesters = this.buildIngesters(opts, gitRoots, primaryRepoName);
      analyzers.push(...ingesters);

      // Layer 2 (primary)
      // toggle 可能 analyzer は lep.json `analyzers.<id>.enabled:false` で無効化できる。
      // disabled の場合は構築・登録せず、対応 event の後段 (例: release_resolved → codegraph) も
      // 連動して止まる。核 analyzer は本セットに id があっても常時登録する。
      const disabledPrimary = new Set(opts.disabledPrimaryAnalyzers ?? []);
      const primaryEnabled = (id: string): boolean => !disabledPrimary.has(id);

      // 核 analyzer (toggle 不可)
      sessionImporter = new SessionImporter({ trailDb, onProgress, onPhase });
      commitResolver = new CommitResolver({ trailDb, gitRoots });
      codeGraphBuilder = new CodeGraphBuilder({
        trailDb,
        gitRoots,
        analyzeFn: opts.analyzeReleaseFn,
        onPhase,
        onProgress,
      });
      const costRebuilder = new CostRebuilder({ trailDb, onPhase, onProgress });
      const countsRebuilder = new CountsRebuilder({ trailDb, onPhase, onProgress });
      // 新ソース取込 (Step 4c): github_pr_review → pr_reviews / pr_review_findings。
      // GitHub source 未設定時は対応 event が来ないため no-op。PersistAnalyzer の save 前に書込む。
      const prReviewImporter = new PrReviewImporter({ trailDb });
      const prReviewFindingAnalyzer = new PrReviewFindingAnalyzer({ trailDb });
      // PersistAnalyzer は tier=2 の最後に置く (他全 analyzer の DB 書込後に save)
      const persistAnalyzer = new PersistAnalyzer({ trailDb });

      // toggle 可能 analyzer (無効時は null → 後続の filter で除外)
      if (primaryEnabled('ReleaseResolver')) {
        releaseResolver = new ReleaseResolver({ trailDb, gitRoots, onPhase, onProgress });
      }
      if (primaryEnabled('CoverageImporter')) {
        coverageImporter = new CoverageImporter({ trailDb, gitRoots, onPhase, onProgress });
      }
      const behaviorAnalyzer = primaryEnabled('BehaviorAnalyzer')
        ? new BehaviorAnalyzer({ trailDb, onPhase, onProgress })
        : null;
      const commitFilesBackfiller = primaryEnabled('CommitFilesBackfiller')
        ? new CommitFilesBackfiller({ trailDb, gitRoots, onProgress })
        : null;
      const subagentTypeBackfiller = primaryEnabled('SubagentTypeBackfiller')
        ? new SubagentTypeBackfiller({ trailDb, onProgress })
        : null;
      if (primaryEnabled('MessageCommitMatcher')) {
        messageCommitMatcher = new MessageCommitMatcher({ trailDb, onProgress });
      }

      // 登録順は従来どおり (PersistAnalyzer は最後)。disabled な toggle analyzer は null で
      // 除外する。core/PR は常時含める。
      const primaryAnalyzers: Analyzer[] = ([
        sessionImporter,
        commitResolver,
        releaseResolver,
        codeGraphBuilder,
        coverageImporter,
        costRebuilder,
        behaviorAnalyzer,
        countsRebuilder,
        commitFilesBackfiller,
        subagentTypeBackfiller,
        messageCommitMatcher,
        prReviewImporter,
        prReviewFindingAnalyzer,
        persistAnalyzer,
      ] as Array<Analyzer | null>).filter((a): a is Analyzer => a !== null);
      // subscribes=[] の analyzer (CountsRebuilder / PersistAnalyzer) は EventBus.subscribe が
      // no-op になる。一律 subscribe しても害はない。
      for (const a of primaryAnalyzers) bus.subscribe(a);
      analyzers.push(...primaryAnalyzers);
    }

    this.sessionImporter = sessionImporter;
    this.commitResolver = commitResolver;
    this.releaseResolver = releaseResolver;
    this.codeGraphBuilder = codeGraphBuilder;
    this.coverageImporter = coverageImporter;
    this.messageCommitMatcher = messageCommitMatcher;

    // Layer 3 (memory): 7 個の memory analyzer を dependsOn topo 順で subscribe
    // (EventBus は subscribe 順に配信するため Drift は content の後・Embedding は最後)。
    let memoryAnalyzerIds: readonly string[] = [];
    let memorySessionProvider: MemoryWaveSessionProvider | null = null;
    if (opts.memoryCoreService) {
      const { analyzers: memAnalyzers, provider } = createMemoryAnalyzers(opts.memoryCoreService, {
        checkLlmAvailability: opts.checkLlmAvailability,
        ollamaBaseUrl: opts.ollamaBaseUrl,
        disabledAnalyzerIds: opts.disabledMemoryAnalyzers,
        // throttle gate = run レベル defer と同じ「enabled かつ COOLING」判定を流用する。
        // COOLING 中は ConversationMemoryAnalyzer が会話ループを中断し次 scope へ進む。
        throttleGate: opts.shouldDeferScheduled,
      });
      const ordered = topoSortByDependsOn(memAnalyzers);
      for (const a of ordered) {
        bus.subscribe(a);
        analyzers.push(a);
      }
      memoryAnalyzerIds = ordered.map((a) => a.id);
      memorySessionProvider = provider;
    }
    this.memoryAnalyzerIds = memoryAnalyzerIds;
    this.memorySessionProvider = memorySessionProvider;

    // Layer 4 (aggregator): trail.db を読んで横断指標を算出する tier=4 analyzer。
    // tier 4 は stage='all' でのみ実行される (LepOrchestrator の STAGE_TIERS)。
    // trailDb が無い場合 (daemon の memory-only 等) は DORA を算出できないため登録しない。
    if (opts.trailDb) {
      this.registerAggregators(opts.trailDb, opts.disabledAggregators ?? [], bus, analyzers);
    }

    this.stage = opts.stage ?? 'primary+memory';
    this.pipelineStatusFilePath = opts.pipelineStatusFilePath;
    this.shouldDeferScheduled = opts.shouldDeferScheduled;

    this.registeredAnalyzerIds = analyzers.map((a) => a.id);

    this.orchestrator = new LepOrchestrator(bus, analyzers, {
      info: (msg) => this.log(msg),
      error: (msg) => this.log(`[ERROR] ${msg}`),
    });

    this.onAfterRun = opts.onAfterRun;
  }

  /** Layer 1 ingesters (sources) を生成する。GitHub PR source は opt-in。 */
  private buildIngesters(
    opts: AnalyzeAllRunnerOptions,
    gitRoots: readonly string[],
    primaryRepoName: string | undefined,
  ): Analyzer[] {
    const ingesters: Analyzer[] = [
      new JsonlIngester({
        gitRoot: opts.gitRoot ?? gitRoots[0],
        repoName: primaryRepoName,
        claudeProjectsDir: opts.claudeProjectsDir,
        codexSessionsDir: opts.codexSessionsDir,
      }),
      new GitIngester({ gitRoots }),
      new CoverageIngester({ gitRoots }),
      new MetaJsonIngester({ claudeProjectsDir: opts.claudeProjectsDir }),
    ];
    // 新ソース参照実装 (Step 4b): GitHub PR review。opt-in (githubPrReview 指定時のみ)。
    if (opts.githubPrReview) {
      ingesters.push(
        new GitHubPrReviewIngester({
          client: opts.githubPrReview.client,
          gitRoots,
          since: opts.githubPrReview.since,
          maxPrs: opts.githubPrReview.maxPrs,
          gitRemoteReader: opts.githubPrReview.gitRemoteReader,
        }),
      );
    }
    return ingesters;
  }

  /** Layer 4 aggregator (DORA / CrossSource) を bus + analyzers に登録する。 */
  private registerAggregators(
    trailDb: TrailDatabase,
    disabledAggregators: readonly string[],
    bus: EventBus,
    analyzers: Analyzer[],
  ): void {
    if (!disabledAggregators.includes('DoraMetricsAggregator')) {
      const doraAggregator = new DoraMetricsAggregator({ trailDb });
      bus.subscribe(doraAggregator);
      analyzers.push(doraAggregator);
    }
    if (!disabledAggregators.includes('CrossSourceCorrelator')) {
      const correlator = new CrossSourceCorrelator({ trailDb });
      bus.subscribe(correlator);
      analyzers.push(correlator);
    }
  }

  protected override async runImpl(reason: RunReason): Promise<void> {
    if (shouldDeferPeriodicRun(reason, this.shouldDeferScheduled)) {
      this.log('[INFO] periodic run deferred — Ollama throttle COOLING');
      return;
    }

    let runError: Error | null = null;

    try {
      const result = await this.orchestrator.runOnce({ runId: randomUUID(), reason, stage: this.stage });

      // trail.db への永続化 (save) は PersistAnalyzer が Wave 2 末端で実施済み
      // (memory-core が trail.db をディスクから attach するため Wave 3 より前である必要がある)。
      // ここでは counter を analyzer から集計するのみ。
      if (this.importPipelineEnabled) {
        this.lastImportResult = this.aggregateImportResult();
      }

      // save() 失敗は PersistAnalyzer の throw として errors に収集される
      const importError = result.errors.get('Persist') ?? null;
      if (importError) {
        this.log(`[ERROR] trail.db save failed: ${importError.message}`);
        runError = new Error(`importAll: ${importError.message}`);
      }

      // Layer 3 (memory) error 集約: 7 個の memory analyzer の id から errors を拾う。
      const memErrors = this.memoryAnalyzerIds
        .map((id) => result.errors.get(id))
        .filter((e): e is Error => e != null);
      if (memErrors.length > 0) {
        const memMsg = memErrors.map((e) => e.message).join('; ');
        if (runError) {
          runError = new Error(`${runError.message}; memory-core: ${memMsg}`);
        } else {
          runError = new Error(`memory-core: ${memMsg}`);
        }
      }
    } finally {
      // Wave 3 で開いた memory-core セッションを必ず閉じる (共有 DB の close)。
      try {
        this.memorySessionProvider?.closeIfOpen();
      } catch (err) {
        this.log(`[WARN] memory session close failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      // stage が memory wave を含まない場合、Wave 3 が走らず status writer が初期化されない。
      // pipeline-status.json の memory scope を skipped で上書きし、UI が古い running/pending を
      // 表示し続けないようにする (memory を含む stage では Wave 3 側 writer に委ねるため書かない)。
      this.markMemoryScopesSkippedIfExcluded();
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
   * stage が memory wave (tier 3) を含まないとき、`pipeline-status.json` の全 memory scope を
   * `skipped` で記録する。Wave 3 が走らないと PipelineStatusWriter が初期化されず、UI が前回 run の
   * `running`/`pending` を表示し続けるのを防ぐ。例外は握り潰して run を妨げない。
   */
  private markMemoryScopesSkippedIfExcluded(): void {
    if (!this.pipelineStatusFilePath) return;
    if (stageIncludesMemory(this.stage)) return;
    try {
      const writer = new PipelineStatusWriter(
        this.pipelineStatusFilePath,
        randomUUID(),
        [...PIPELINE_SCOPES],
      );
      writer.markAllSkipped(`stage=${this.stage} excludes memory wave`);
    } catch (err) {
      this.log(
        `[WARN] failed to mark memory scopes skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 直近 `runImpl` で実行した import 結果。trail.db パイプライン無効時は常に null。
   * 失敗時 (save() 例外) は更新されず前回成功時の値が残る。
   */
  getLastImportResult(): ImportAllResult | null {
    return this.lastImportResult;
  }

  /**
   * trail.db import パイプライン (Layer 1 ingester + Layer 2 primary analyzer) が有効か。
   * `trailDb` 未指定 / `enableIngesters:false` の場合は false (memory-core ステップのみ実行)。
   * daemon の配線検証 (trailDb が runner に届いているか) に使う。
   */
  get importEnabled(): boolean {
    return this.importPipelineEnabled;
  }

  /**
   * 登録済み全 analyzer の id 一覧 (Layer 1-4、toggle 反映後)。
   * lep.json `analyzers.<id>.enabled:false` で除外された analyzer は含まれない。
   * 主に toggle 配線の検証に使う。
   */
  getActiveAnalyzerIds(): readonly string[] {
    return this.registeredAnalyzerIds;
  }

  private aggregateImportResult(): ImportAllResult {
    const sessionCounters = this.sessionImporter?.getCounters() ?? { imported: 0, skipped: 0 };
    const coverageCounters = this.coverageImporter?.getCounters() ?? {
      coverageImported: 0,
      currentCoverageImported: 0,
    };
    return {
      imported: sessionCounters.imported,
      skipped: sessionCounters.skipped,
      commitsResolved: this.commitResolver?.getCommitsResolved() ?? 0,
      releasesResolved: this.releaseResolver?.getReleasesResolved() ?? 0,
      releasesAnalyzed: this.codeGraphBuilder?.getReleasesAnalyzed() ?? 0,
      coverageImported: coverageCounters.coverageImported,
      currentCoverageImported: coverageCounters.currentCoverageImported,
      messageCommitsBackfilled: this.messageCommitMatcher?.getMessageCommitsBackfilled() ?? 0,
    };
  }
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
