import * as path from 'node:path';

import { ExecFileGitService } from '@anytime-markdown/trail-db';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { ScoredFunction } from '@anytime-markdown/trail-core/importance';
import type { FileCategory } from '@anytime-markdown/trail-core/classify';

import { loadAnalyzeExclude, seedAnalyzeExclude } from '@anytime-markdown/trail-core/analyzeExclude';
import { classifyPythonFiles } from '@anytime-markdown/code-analysis-python';

import type { Logger } from '../runtime/Logger';
import type { CodeGraphService } from './CodeGraphService';
export { findTsconfigCandidates, hasPythonFiles } from './analyzeUtils';
export type { TsconfigCandidate } from './analyzeUtils';

/**
 * AnalyzePipeline が呼び出し元 (TrailDataServer) の特定メソッドに依存するための契約。
 * 具象クラスへの逆方向依存を避けるため、必要な振る舞いだけを切り出している。
 */
export interface AnalyzePipelineCallbacks {
  notifyProgress(phase: string, percent: number): void;
  notifyCodeGraphProgress(phase: string, percent: number): void;
  notifyCodeGraphUpdated(): void;
  /**
   * C4 モデル (current_graphs → trailToC4) を更新したことを viewer へ通知する
   * (`model-updated` WS イベント)。解析は code graph と C4 モデルの両方を更新するため、
   * `notifyCodeGraphUpdated()` と対で呼ぶ。viewer はこの通知で C4 モデルを再 fetch する。
   */
  notifyModelUpdated(): void;
  computeAndPersistImportance(
    tsconfigPath: string,
    exclude: import('ignore').Ignore | undefined,
    program: import('typescript').Program,
  ): Promise<{
    scored: import('@anytime-markdown/trail-core/importance').ScoredFunction[];
    lineCountByFile: ReadonlyMap<string, number>;
  } | null>;
}

const ANALYZE_PHASES = [
  'Loading project...',
  'Extracting symbols...',
  'Extracting dependencies...',
  'Filtering results...',
] as const;

function phasePercent(phase: string): number {
  const idx = (ANALYZE_PHASES as readonly string[]).indexOf(phase);
  return idx >= 0 ? Math.round((idx / ANALYZE_PHASES.length) * 100) : -1;
}

const NOOP_LOGGER: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => NOOP_LOGGER,
};

export interface AnalyzeCurrentOpts {
  analysisRoot: string;
  /**
   * 除外パターン (`.anytime/trail/analyze-exclude`) を読むルート。開いているワークスペースの
   * ルートを渡す想定。省略時は後方互換で `analysisRoot` から読む。
   * 外部リポ（gitRoots）解析時に、対象リポ自身ではなくワークスペースの exclude を
   * 適用するために使う。
   */
  excludeRoot?: string;
  /** tsconfig.json の絶対パス。無い場合（Python-only リポ）は undefined。 */
  tsconfigPath: string | undefined;
  trailDb: TrailDatabase;
  callbacks: AnalyzePipelineCallbacks;
  codeGraphService: CodeGraphService;
  /** Logger instance. Defaults to a no-op logger if not provided. */
  logger?: Logger;
  /** UI 側（VS Code progress）の進捗コールバック。HTTP 経路では未指定。 */
  onProgress?: (phase: string, percent?: number) => void;
  /**
   * 解析子プロセス (analyze-child.js) の絶対パス。指定時は TS 経路を child_process で
   * 隔離する（SIGSEGV 耐性化）。未指定時は在来どおりホスト内で計算する（テスト・後方互換）。
   */
  analyzeChildPath?: string;
}

export interface AnalyzeCurrentResult {
  repoName: string;
  tsconfigPath: string;
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  commitId: string;
  durationMs: number;
  /** 非致命的な警告（importance / code graph / coverage 失敗時） */
  warnings: string[];
}

/** 解析ブランチ（TS / Python-only）の共通結果。共通末尾の永続化に渡す。 */
interface AnalyzeBranchResult {
  /** current_graphs に保存した TrailGraph（fileCount/nodeCount/edgeCount に使う）。null=保存不可。 */
  readonly graph: TrailGraph | null;
  readonly scored: readonly ScoredFunction[];
  readonly lineCountByFile: ReadonlyMap<string, number>;
  readonly categoryByFile?: ReadonlyMap<string, FileCategory>;
}

/**
 * TS 経路: tsconfig から ts.Program を構築し、C4 TrailGraph 保存・importance 計算・
 * classify を行う。混在リポ（+.py）では Python importance を結合する（Phase 2 方針 A）。
 */
async function analyzeTypeScriptBranch(
  opts: AnalyzeCurrentOpts,
  tsconfigPath: string,
  exclude: import('ignore').Ignore | undefined,
  commitId: string,
  repoName: string,
  logger: Logger,
  warnings: string[],
): Promise<AnalyzeBranchResult> {
  const { analysisRoot, trailDb, callbacks, codeGraphService, onProgress } = opts;

  const reportProgress = (phase: string): void => {
    logger.info(`C4 analysis [${repoName}]: ${phase}`);
    const percent = phasePercent(phase);
    callbacks.notifyProgress(phase, percent);
    onProgress?.(phase, percent);
  };

  const request = {
    analysisRoot,
    excludeRoot: opts.excludeRoot,
    tsconfigPath,
    pythonWasmPath: codeGraphService.getPythonWasmPath(),
  };

  // 重い TS 解析（program 構築・抽出・importance・classify）は child_process に隔離する。
  // 子が SIGSEGV してもホストは生存し、AnalyzeChildRunner が 1 回リトライする。
  // analyzeChildPath 未指定時は在来どおりホスト内で計算する（テスト・後方互換）。
  let compute: import('./analyzeChildProtocol').AnalyzeComputeResult;
  if (opts.analyzeChildPath) {
    const { AnalyzeChildRunner } = await import('./AnalyzeChildRunner.js');
    const runner = new AnalyzeChildRunner(opts.analyzeChildPath, {
      onProgress: (phase) => reportProgress(phase),
      logger,
    });
    compute = await runner.run(request);
  } else {
    const { computeAnalysis } = await import('./computeAnalysis.js');
    compute = await computeAnalysis(request, (phase) => reportProgress(phase));
  }
  warnings.push(...compute.warnings);

  trailDb.saveCurrentGraph(compute.graph, tsconfigPath, commitId, repoName);
  logger.info(
    `C4 analysis [${repoName}]: TrailGraph saved to current_graphs (repo=${repoName}, commit=${commitId || 'unknown'})`,
  );
  logger.info(
    `C4 analysis [${repoName}]: classified ${compute.categoryByFile?.length ?? 0} files, scored ${compute.scored.length} functions`,
  );

  return {
    graph: compute.graph,
    scored: compute.scored,
    lineCountByFile: new Map(compute.lineCountByFile),
    categoryByFile: compute.categoryByFile ? new Map(compute.categoryByFile) : undefined,
  };
}

/**
 * Python-only 経路（tsconfig 無し）: 言語レジストリで TrailGraph を生成して
 * current_graphs に保存（C4 モデルは getCurrentC4Model=trailToC4 で都度導出）し、
 * PythonAdapter ベースの importance と PythonFileClassifier による ui/logic/excluded
 * 分類（categoryByFile）を算出する。
 */
async function analyzePythonOnlyBranch(
  opts: AnalyzeCurrentOpts,
  exclude: import('ignore').Ignore | undefined,
  commitId: string,
  repoName: string,
  logger: Logger,
  warnings: string[],
): Promise<AnalyzeBranchResult> {
  const { analysisRoot, trailDb, codeGraphService, onProgress } = opts;
  onProgress?.('Analyzing Python sources...');
  const graph = (await codeGraphService.analyzeRepoTrailGraph(analysisRoot)) ?? null;
  if (graph) {
    // Python-only は tsconfig 無しのため tsconfig_path は空文字で保存する。
    trailDb.saveCurrentGraph(graph, '', commitId, repoName);
    logger.info(
      `C4 analysis [${repoName}]: TrailGraph saved to current_graphs (repo=${repoName}, commit=${commitId || 'unknown'})`,
    );
  } else {
    warnings.push('python TrailGraph analysis returned no graph');
  }

  let scored: readonly ScoredFunction[] = [];
  let lineCountByFile: ReadonlyMap<string, number> = new Map();
  try {
    onProgress?.('Computing importance scores...');
    const { computePythonImportance } = await import('./computePythonImportance.js');
    const py = await computePythonImportance({
      repoRoot: analysisRoot,
      exclude,
      pythonWasmPath: codeGraphService.getPythonWasmPath(),
      logger,
    });
    scored = py.scored;
    lineCountByFile = py.lineCountByFile;
    logger.info(`C4 analysis [${repoName}]: python importance computed (${py.scored.length} functions)`);
  } catch (err) {
    const msg = `python importance failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.warn(`C4 analysis [${repoName}]: ${msg}`);
    warnings.push(msg);
  }

  // Python ファイルを ui/logic/excluded に分類して category に反映する。
  let categoryByFile: ReadonlyMap<string, FileCategory> | undefined;
  try {
    categoryByFile = await classifyPythonFiles({
      repoRoot: analysisRoot,
      exclude,
      pythonWasmPath: codeGraphService.getPythonWasmPath(),
    });
  } catch (err) {
    const msg = `python classify failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.warn(`C4 analysis [${repoName}]: ${msg}`);
    warnings.push(msg);
  }

  return { graph, scored, lineCountByFile, categoryByFile };
}

async function generateCodeGraph(args: {
  codeGraphService: CodeGraphService;
  repoName: string;
  analysisRoot: string;
  trailGraph: TrailGraph | null;
  callbacks: AnalyzePipelineCallbacks;
  onProgress: AnalyzeCurrentOpts['onProgress'];
  logger: Logger;
  warnings: string[];
}): Promise<void> {
  const { codeGraphService, repoName, analysisRoot, trailGraph, callbacks, onProgress, logger, warnings } = args;
  // per-call の analysisRoot を current_code_graphs / communities 生成へ貫通させる。
  // codeGraphService は activate 時に固定した repositories を持つため、上書きしないと
  // 別 repo を再生成し current_graphs(per-call) と current_code_graphs(固定) がズレる。
  // 直前の解析で得た TrailGraph を流用し、generateForRepo 内での二重解析を避ける。
  const override = {
    repositories: [{ id: repoName, label: repoName, path: analysisRoot }],
    trailGraphByRepoId: trailGraph ? { [repoName]: trailGraph } : undefined,
  };
  try {
    onProgress?.('Generating code graph...');
    await codeGraphService.generate((phase, percent) => {
      callbacks.notifyCodeGraphProgress(phase, percent);
      onProgress?.(`Code graph: ${phase}`, percent);
    }, override);
    // generate() は fresh graph で in-memory cache を上書きするため、
    // saveCurrentCodeGraph で温存された AI 要約は cache に反映されない。
    // loadFromDb() で DB と join 済みの graph を取り直し、要約込みで cache を再構築する。
    try {
      await codeGraphService.loadFromDb(repoName);
    } catch (err) {
      logger.warn(`C4 analysis [${repoName}]: cache compose failed (loadFromDb): ${err instanceof Error ? err.message : String(err)}`);
    }
    callbacks.notifyCodeGraphUpdated();
  } catch (err) {
    const msg = `code graph generation failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(`C4 analysis [${repoName}]: ${msg}`, err);
    warnings.push(msg);
  }
}

async function computeFileAnalysisStep(args: {
  analysisRoot: string;
  repoName: string;
  trailDb: TrailDatabase;
  branch: AnalyzeBranchResult;
  onProgress: AnalyzeCurrentOpts['onProgress'];
  logger: Logger;
  warnings: string[];
}): Promise<void> {
  const { analysisRoot, repoName, trailDb, branch, onProgress, logger, warnings } = args;
  try {
    onProgress?.('Computing file analysis...');
    if (branch.scored.length > 0) {
      const { computeAndPersistFileAnalysis } = await import('./computeAndPersistFileAnalysis.js');
      const { fileRows, functionRows } = await computeAndPersistFileAnalysis({
        analysisRoot,
        repoName,
        trailDb,
        scored: branch.scored,
        lineCountByFile: branch.lineCountByFile,
        categoryByFile: branch.categoryByFile,
      });
      logger.info(
        `C4 analysis [${repoName}]: file_analysis=${fileRows} function_analysis=${functionRows}`,
      );
    } else {
      logger.warn(`C4 analysis [${repoName}]: skipping file analysis (no scored functions)`);
    }
  } catch (err) {
    const msg = `file analysis failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.warn(`C4 analysis [${repoName}]: ${msg}`);
    warnings.push(msg);
  }
}

/**
 * C4 / コードグラフ解析の本体パイプライン。
 * VS Code コマンド (`anytime-trail.analyzeCurrentCode`) と HTTP エンドポイント
 * (`POST /api/analyze/current`) の両方から呼び出される。tsconfig があれば TS 経路、
 * 無く .py があれば Python-only 経路を実行する。
 *
 * UI 専用処理（QuickPick・vscode.window.withProgress・showInformationMessage）は
 * 含まない。それらは呼び出し側で実装する。
 */
export async function runAnalyzeCurrentCodePipeline(
  opts: AnalyzeCurrentOpts,
): Promise<AnalyzeCurrentResult> {
  const { analysisRoot, trailDb, callbacks, codeGraphService, onProgress } = opts;
  const logger = opts.logger ?? NOOP_LOGGER;
  const startedAt = Date.now();
  const repoName = path.basename(analysisRoot);
  const warnings: string[] = [];

  callbacks.notifyProgress('Loading project...', 0);
  onProgress?.('Loading project...', 0);

  try {
    // seed は従来どおり解析対象リポ自身に対して行う（読み込み先は excludeRoot へ切替）。
    const seeded = seedAnalyzeExclude(analysisRoot);
    if (seeded) {
      logger.info(`C4 analysis [${repoName}]: .anytime/trail/analyze-exclude created`);
    }
  } catch (err) {
    warnings.push(`seedAnalyzeExclude failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  // 除外パターンは開いているワークスペース (excludeRoot) から読む。省略時は analysisRoot。
  const exclude = loadAnalyzeExclude(opts.excludeRoot ?? analysisRoot);

  // commitId は両ブランチ共通（getHeadCommit は git 非リポでは警告のみ）。
  let commitId = '';
  try {
    commitId = new ExecFileGitService(analysisRoot).getHeadCommit();
  } catch (err) {
    logger.warn(
      `C4 analysis [${repoName}]: getHeadCommit failed (not a git repo?): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // tsconfig があれば TS 経路、無ければ Python-only 経路。両者とも current_graphs へ
  // TrailGraph を保存し、scored / lineCountByFile / categoryByFile を共通末尾へ渡す。
  const branch = opts.tsconfigPath
    ? await analyzeTypeScriptBranch(opts, opts.tsconfigPath, exclude, commitId, repoName, logger, warnings)
    : await analyzePythonOnlyBranch(opts, exclude, commitId, repoName, logger, warnings);
  const graph = branch.graph;
  logger.info(
    `C4 analysis [${repoName}]: analyzed ${graph?.metadata.fileCount ?? 0} files, ${graph?.nodes.length ?? 0} nodes, ${graph?.edges.length ?? 0} edges`,
  );

  // C4 モデル (current_graphs → trailToC4) は branch 内の saveCurrentGraph で更新済み。
  // code graph 生成 (下記 try) の成否に依存せず viewer の C4 モデルを再 fetch させるため、
  // ここで model-updated を通知する。
  callbacks.notifyModelUpdated();

  await generateCodeGraph({ codeGraphService, repoName, analysisRoot, trailGraph: graph, callbacks, onProgress, logger, warnings });

  try {
    const count = trailDb.importCurrentCoverage(analysisRoot, repoName);
    logger.info(`C4 analysis [${repoName}]: current_coverage updated (${count} entries)`);
  } catch (err) {
    const msg = `importCurrentCoverage failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.warn(`C4 analysis [${repoName}]: ${msg}`);
    warnings.push(msg);
  }

  // .anytime/dead-code-ignore をシードする（初回のみ作成）
  try {
    onProgress?.('Seeding dead-code-ignore...');
    const { seedDeadCodeIgnore } = await import('@anytime-markdown/trail-core/deadCode');
    const seeded = seedDeadCodeIgnore(analysisRoot);
    if (seeded) {
      logger.info(`C4 analysis [${repoName}]: .anytime/dead-code-ignore created`);
    }
  } catch (err) {
    warnings.push(`seedDeadCodeIgnore failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ファイル別・関数別デッドコード解析を current_file_analysis / current_function_analysis に保存。
  // scored / lineCountByFile / categoryByFile は実行したブランチ（TS / Python-only）の結果を使う。
  await computeFileAnalysisStep({
    analysisRoot,
    repoName,
    trailDb,
    branch,
    onProgress,
    logger,
    warnings,
  });

  callbacks.notifyProgress('', 100);
  onProgress?.('', 100);

  return {
    repoName,
    tsconfigPath: opts.tsconfigPath ?? '',
    fileCount: graph?.metadata.fileCount ?? 0,
    nodeCount: graph?.nodes.length ?? 0,
    edgeCount: graph?.edges.length ?? 0,
    commitId,
    durationMs: Date.now() - startedAt,
    warnings,
  };
}

export interface AnalyzeReleaseOpts {
  trailDb: TrailDatabase;
  codeGraphService: CodeGraphService;
  gitRoot: string;
  onProgress?: (msg: string) => void;
}

export interface AnalyzeReleaseResult {
  releaseCount: number;
  durationMs: number;
}

/**
 * release 別 C4 / コードグラフ解析パイプライン。
 * 既存 release_code_graphs を全削除して再生成する（洗い替え方式）。
 *
 * TODO: release_file_analysis / release_function_analysis への保存は将来タスクで対応する。
 * リリースごとの dead code 解析は現時点では未実装（Task 13 スコープ外）。
 */
export async function runAnalyzeReleaseCodePipeline(
  opts: AnalyzeReleaseOpts,
): Promise<AnalyzeReleaseResult> {
  const { trailDb, codeGraphService, gitRoot, onProgress } = opts;
  const startedAt = Date.now();

  onProgress?.('Clearing release code graphs...');
  trailDb.deleteReleaseCodeGraphs();

  onProgress?.('Analyzing release code...');
  const releaseCount = await trailDb.analyzeReleaseCodeGraphsForce({
    codeGraphService,
    gitRoot,
    onProgress: (msg) => onProgress?.(msg),
  });

  return {
    releaseCount,
    durationMs: Date.now() - startedAt,
  };
}
