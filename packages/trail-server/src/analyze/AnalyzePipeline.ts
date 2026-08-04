import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { resolveGitExecutable } from '@anytime-markdown/trail-core/gitExecutable';
import { ExecFileGitService } from '@anytime-markdown/trail-db';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import type { ScoredFunction } from '@anytime-markdown/trail-core/importance';
import type { FileCategory } from '@anytime-markdown/trail-core/classify';

import { loadAnalyzeExclude, seedAnalyzeExclude } from '@anytime-markdown/trail-core/analyzeExclude';
import { classifyPythonFiles } from '@anytime-markdown/code-analysis-python';

import type { Logger } from '../runtime/Logger';
import type { CodeGraphService } from './CodeGraphService';
import { recordBoundaryDrift } from './recordBoundaryDrift';
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

/**
 * TS 解析（program 構築・抽出・importance・classify）の実行方式。
 *
 * Why not 省略可能な `analyzeChildPath?: string`: 省略時に「ホスト内計算へ黙って縮退する」
 * 設計だったため、渡し忘れが型でも実行時でも検出できず、webpack バンドル済みの daemon では
 * 出力に含まれない `computeAnalysis.js` の動的 import へ落ちて必ず失敗していた
 * （HTTP 経路 `server.onAnalyzeCurrentCode` の実例）。呼び出し側に方式の明示を強制し、
 * `in-host` を選ぶのは非バンドル環境（jest・standalone CLI）だけにする。
 */
export type AnalyzeComputeMode =
  /** 解析子プロセス `analyze-child.js` へ隔離する（SIGSEGV 耐性化）。バンドル環境は常にこれ。 */
  | { readonly kind: 'child'; readonly analyzeChildPath: string }
  /** ホストプロセス内で計算する。`computeAnalysis.js` が解決できる環境でのみ選べる。 */
  | { readonly kind: 'in-host' };

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
  /** TS 解析の実行方式。省略不可（渡し忘れによる縮退を型で塞ぐ）。 */
  compute: AnalyzeComputeMode;
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
    // current 解析では decision comment を抽出して trail-db に永続化する
    // （memory-core が typescript を持たず trail-db 経由で読むため）。
    includeDecisionComments: true,
  };

  // 重い TS 解析（program 構築・抽出・importance・classify）は child_process に隔離する。
  // 子が SIGSEGV してもホストは生存し、AnalyzeChildRunner が 1 回リトライする。
  // in-host は呼び出し側が明示的に選んだ時だけ通る（非バンドル環境専用）。
  let computed: import('./analyzeChildProtocol').AnalyzeComputeResult;
  if (opts.compute.kind === 'child') {
    const { AnalyzeChildRunner } = await import('./AnalyzeChildRunner.js');
    const runner = new AnalyzeChildRunner(opts.compute.analyzeChildPath, {
      onProgress: (phase) => reportProgress(phase),
      logger,
    });
    computed = await runner.run(request);
  } else {
    // computeAnalysis は trail-core/analyze (typescript) を引き込む。daemon バンドルは
    // 常に kind:'child' を渡すためこの分岐に到達しないが、webpack は静的に追跡して
    // typescript を同梱してしまう。webpackIgnore で追跡を止め、trail-daemon.js から
    // typescript を排除する。その代償として、バンドル出力に computeAnalysis.js は存在しない
    // ＝ここへ到達した時点で必ず失敗する。到達可能なのは jest・standalone CLI だけである。
    const { computeAnalysis } = await import(/* webpackIgnore: true */ './computeAnalysis.js');
    computed = await computeAnalysis(request, (phase) => reportProgress(phase));
  }
  warnings.push(...computed.warnings);

  trailDb.saveCurrentGraph(computed.graph, tsconfigPath, commitId, repoName);
  logger.info(
    `C4 analysis [${repoName}]: TrailGraph saved to current_graphs (repo=${repoName}, commit=${commitId || 'unknown'})`,
  );

  // decision comment を trail-db へ洗い替え永続化（memory-core が読む中継）。
  try {
    trailDb.saveDecisionComments(repoName, computed.decisionComments ?? [], {
      commitSha: commitId || null,
      recordedAt: new Date().toISOString(),
    });
    logger.info(
      `C4 analysis [${repoName}]: saved ${computed.decisionComments?.length ?? 0} decision comments`,
    );
  } catch (err) {
    const msg = `saveDecisionComments failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.warn(`C4 analysis [${repoName}]: ${msg}`);
    warnings.push(msg);
  }
  logger.info(
    `C4 analysis [${repoName}]: classified ${computed.categoryByFile?.length ?? 0} files, scored ${computed.scored.length} functions`,
  );

  return {
    graph: computed.graph,
    scored: computed.scored,
    lineCountByFile: new Map(computed.lineCountByFile),
    categoryByFile: computed.categoryByFile ? new Map(computed.categoryByFile) : undefined,
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

/**
 * コードグラフを生成し、in-memory cache を DB と join 済みの内容で再構築する。
 *
 * @returns 生成が成功したか。`getGraph()` は cache を返すだけで失敗時に invalidate されず、
 * 長寿命の daemon では前回グラフがそのまま残るため、後段が「今回のグラフ」を要求する
 * 処理（境界ドリフト判定）は本戻り値で成否を判別する。
 */
async function generateCodeGraph(args: {
  codeGraphService: CodeGraphService;
  repoName: string;
  analysisRoot: string;
  trailGraph: TrailGraph | null;
  callbacks: AnalyzePipelineCallbacks;
  onProgress: AnalyzeCurrentOpts['onProgress'];
  logger: Logger;
  warnings: string[];
}): Promise<boolean> {
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
    return true;
  } catch (err) {
    const msg = `code graph generation failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(`C4 analysis [${repoName}]: ${msg}`, err);
    warnings.push(msg);
    return false;
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

  const codeGraphGenerated = await generateCodeGraph({ codeGraphService, repoName, analysisRoot, trailGraph: graph, callbacks, onProgress, logger, warnings });

  // コードグラフ保存後にのみ意味を持つ（community 付与済みノードが要る）ため、
  // generateCodeGraph の直後に置く。fail-open は recordBoundaryDrift 側が担う。
  // 生成失敗回は判定しない。getGraph() は cache を返すだけなので、呼ぶと前回グラフに
  // 対する判定が「今回の検出回」として記録されてしまう。
  if (codeGraphGenerated) {
    recordBoundaryDrift({
      repoName,
      graph: codeGraphService.getGraph(repoName),
      trailDb,
      logger,
      warnings,
    });
  } else {
    logger.warn(`C4 analysis [${repoName}]: boundary drift skipped (code graph generation failed)`);
  }

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

/**
 * 遡及生成の対象範囲。`tags` 指定時は生成も削除もそのタグ集合に限定する。
 *
 * 省略可能な `tags?: string[]` にしない。渡し忘れが「黙って全量洗い替え」になり、
 * オンデマンド生成のたびに既存キャッシュを消してしまう事故が型でも実行時でも
 * 検出できないためである（同じ形の欠陥が `analyze_current_code` で実際に起きた）。
 */
export type AnalyzeReleaseScope =
  | { kind: 'all' }
  | { kind: 'tags'; tags: readonly string[] };

/**
 * 外部境界（HTTP body / IPC request）の省略可能な `tags` を `scope` へ正規化する。
 *
 * 空配列は「全量」ではなく「対象 0 件」と解釈する。破壊的な側（全量削除）へ縮退させない
 * ため、all になるのは `undefined`（そもそも指定が無い）のときだけとする。
 */
export function toAnalyzeReleaseScope(
  tags: readonly string[] | undefined,
): AnalyzeReleaseScope {
  return tags === undefined ? { kind: 'all' } : { kind: 'tags', tags };
}

export interface AnalyzeReleaseOpts {
  trailDb: TrailDatabase;
  codeGraphService: CodeGraphService;
  gitRoot: string;
  /**
   * TS 解析の実行方式。current 解析と同じ判別子ユニオンを使い、省略不可とする。
   * 省略可能にすると「渡し忘れ＝黙って縮退」が型でも実行時でも検出できない。
   */
  compute: AnalyzeComputeMode;
  /** 対象範囲。全量洗い替えか、タグ指定か。省略不可（上記 AnalyzeReleaseScope 参照）。 */
  scope: AnalyzeReleaseScope;
  /** グラフ内のリポジトリ名。省略時は gitRoot の basename を使う。 */
  repoLabel?: string;
  logger?: Logger;
  onProgress?: (msg: string) => void;
}

export interface AnalyzeReleaseResult {
  releaseCount: number;
  durationMs: number;
}

/**
 * タグの worktree を TS 解析して TrailGraph を得る。tsconfig.json が無ければ undefined。
 *
 * `CodeGraphService` は TypeScript を解析しない（言語レジストリは Python のみ登録し、
 * TS は analyze-child へ一本化されている）。そのため TS リポジトリのコードグラフは
 * ここで得た TrailGraph を `generate()` の override へ渡して初めて成立する。
 */
async function analyzeReleaseWorktree(args: {
  worktreeRoot: string;
  compute: AnalyzeComputeMode;
  pythonWasmPath: string | undefined;
  logger: Logger;
}): Promise<TrailGraph | undefined> {
  const tsconfigPath = path.join(args.worktreeRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return undefined;

  const request = {
    analysisRoot: args.worktreeRoot,
    // 過去タグの除外設定はそのタグの worktree 内のものを使う。
    excludeRoot: args.worktreeRoot,
    tsconfigPath,
    pythonWasmPath: args.pythonWasmPath,
    // decision comment の永続化は current 解析だけの責務（memory-core への中継）。
    // 過去タグの抽出結果で現在のテーブルを上書きしない。
    includeDecisionComments: false,
  };

  if (args.compute.kind === 'child') {
    const { AnalyzeChildRunner } = await import('./AnalyzeChildRunner.js');
    const runner = new AnalyzeChildRunner(args.compute.analyzeChildPath, { logger: args.logger });
    return (await runner.run(request)).graph;
  }
  const { computeAnalysis } = await import(/* webpackIgnore: true */ './computeAnalysis.js');
  return (await computeAnalysis(request)).graph;
}

/** `git worktree` の後片付け。remove が失敗しても rmSync で残骸を消す。 */
function cleanupWorktree(gitRoot: string, worktreeRoot: string, logger: Logger): void {
  try {
    execFileSync(resolveGitExecutable(), ['worktree', 'remove', worktreeRoot, '--force'], {
      cwd: gitRoot,
      stdio: 'pipe',
    });
    return;
  } catch {
    // remove に失敗した場合だけ実体を消す（未登録・破損時のフォールバック）。
  }
  try {
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
  } catch (e) {
    // 後片付けの失敗は解析結果に影響しないので続行するが、tmpdir に残骸が残るため痕跡を残す。
    logger.warn(
      `[runAnalyzeReleaseCodePipeline] failed to clean up worktree ${worktreeRoot}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * 指定コミットの worktree を切って、その時点のコードグラフを 1 本作る。
 *
 * release 遡及生成とコミット単位のオンデマンド生成が共有する本体。**振る舞いは
 * release 経路から動かしていない**（ref を tag から解決するか sha を直接使うかだけが違う）。
 *
 * `persist: false` により `current_code_graphs` は汚さない。保存は呼び出し元が行う。
 * `trailGraphByRepoId` に空オブジェクトを明示するのは、undefined だと `trailGraphProvider`
 * （現在の TrailGraph を返す）へフォールバックし、過去の断面に現在のグラフが混入するため。
 *
 * @returns 生成できたグラフ。`codeGraphService` が 1 本も返さなければ null
 */
async function generateCodeGraphAtCommit(args: {
  codeGraphService: CodeGraphService;
  gitRoot: string;
  commitHash: string;
  worktreeRoot: string;
  compute: AnalyzeComputeMode;
  repoLabel: string;
  logger: Logger;
}): Promise<CodeGraph | null> {
  const { gitRoot, worktreeRoot, repoLabel, logger } = args;
  if (fs.existsSync(worktreeRoot)) {
    cleanupWorktree(gitRoot, worktreeRoot, logger);
  }
  execFileSync(
    resolveGitExecutable(),
    ['worktree', 'add', '--detach', worktreeRoot, args.commitHash],
    { cwd: gitRoot, stdio: 'pipe' },
  );

  // worktree へ node_modules を symlink しない（旧実装は張っていた）。
  // main の node_modules には `@anytime-markdown/*` → 現在の packages/ という
  // symlink が含まれるため、張ると**過去の断面の解析が現在のソースで汚染される**。

  const trailGraph = await analyzeReleaseWorktree({
    worktreeRoot,
    compute: args.compute,
    pythonWasmPath: args.codeGraphService.getPythonWasmPath(),
    logger,
  });

  const graphs = await args.codeGraphService.generate(undefined, {
    repositories: [{ id: repoLabel, label: repoLabel, path: worktreeRoot }],
    trailGraphByRepoId: trailGraph ? { [repoLabel]: trailGraph } : {},
    persist: false,
  });
  return graphs[0] ?? null;
}

/**
 * `scope` に従って対象の release を選ぶ。
 *
 * `releases` に無いタグ（未リリース・別リポのタグ・打ち間違い）は対象から外れるが、
 * 戻り値の件数だけでは「指定したのに生成されなかった」ことが呼び出し元に伝わらないため
 * warn に残す。
 */
function selectReleases<T extends { tag: string }>(
  releases: readonly T[],
  scope: AnalyzeReleaseScope,
  logger: Logger,
): readonly T[] {
  if (scope.kind === 'all') return releases;
  const wanted = new Set(scope.tags);
  const selected = releases.filter((r) => wanted.has(r.tag));
  const found = new Set(selected.map((r) => r.tag));
  const unknown = [...wanted].filter((t) => !found.has(t));
  if (unknown.length > 0) {
    logger.warn(
      `[runAnalyzeReleaseCodePipeline] tags not found in releases (skipped): ${unknown.join(', ')}`,
    );
  }
  return selected;
}

/**
 * release 別コードグラフ解析パイプライン。
 * `scope` の範囲について、既存 release_code_graphs を削除してから再生成する。
 * `{kind:'all'}` は従来どおりの全量洗い替え、`{kind:'tags'}` は対象タグのみを
 * 入れ替える（オンデマンド生成で既存キャッシュを消さないため）。
 *
 * タグごとに worktree を切り、**その worktree を解析対象として** TrailGraph を作り、
 * `generate()` の override へ渡す。`persist: false` により current_code_graphs は汚さない
 * （保存は `saveReleaseCodeGraph` が行う）。
 *
 * TODO: release_file_analysis / release_function_analysis への保存は将来タスクで対応する。
 * リリースごとの dead code 解析は現時点では未実装（Task 13 スコープ外）。
 */
export async function runAnalyzeReleaseCodePipeline(
  opts: AnalyzeReleaseOpts,
): Promise<AnalyzeReleaseResult> {
  const { trailDb, codeGraphService, gitRoot, compute, scope, onProgress } = opts;
  const logger = opts.logger ?? NOOP_LOGGER;
  const repoLabel = opts.repoLabel || path.basename(gitRoot);
  const git = new ExecFileGitService(gitRoot);
  const startedAt = Date.now();

  onProgress?.('Analyzing release code...');
  const allReleases = trailDb.getReleases();
  const releases = selectReleases(allReleases, scope, logger);

  onProgress?.('Clearing release code graphs...');
  if (scope.kind === 'all') {
    trailDb.deleteReleaseCodeGraphs();
  } else {
    // 対象タグのみを消す。全削除にするとオンデマンド生成のたびに既存キャッシュが飛ぶ。
    // 解析に失敗したタグの古いグラフも消える（洗い替えの意味論を範囲内で維持する）。
    trailDb.deleteReleaseCodeGraphsForTags(scope.tags);
  }

  let releaseCount = 0;

  for (const release of releases) {
    const tag = release.tag;
    const worktreeRoot = path.join(os.tmpdir(), `trail-cg-release-${tag.replaceAll('/', '-')}`);
    try {
      onProgress?.(`Generating code graph for release ${tag}...`);
      // タグ名を直接渡さず commit hash へ解決してから worktree を作る。タグと同名の
      // ブランチが存在すると ref 解決が曖昧になり、意図しない断面を解析しうる。
      const graph = await generateCodeGraphAtCommit({
        codeGraphService,
        gitRoot,
        commitHash: git.getTagCommitHash(tag),
        worktreeRoot,
        compute,
        repoLabel,
        logger,
      });
      if (!graph) {
        onProgress?.(`Skipping ${tag}: no code graph generated`);
        continue;
      }
      trailDb.saveReleaseCodeGraph(tag, graph);
      releaseCount++;
      onProgress?.(`Release ${tag}: code graph saved`);
    } catch (e) {
      // onProgress は進捗ストリームへ流れるだけで永続化されない。解析対象がタグごとの
      // worktree である以上、古いタグが正当に失敗する（tsconfig 欠如・当時の依存構成など）
      // ことは現実に起こる。戻り値は成功件数しか持たないため、どのタグがなぜ落ちたかは
      // ログにしか残せない。
      const reason = e instanceof Error ? e.message : String(e);
      logger.warn(`[runAnalyzeReleaseCodePipeline] skipped tag=${tag}: ${reason}`);
      onProgress?.(`Skipping ${tag}: ${reason}`);
    } finally {
      cleanupWorktree(gitRoot, worktreeRoot, logger);
    }
  }

  return {
    releaseCount,
    durationMs: Date.now() - startedAt,
  };
}

/** リポジトリあたりのコミットスナップショット保持本数の既定。約 60 MB 相当。 */
export const DEFAULT_COMMIT_CODE_GRAPH_RETENTION = 30;

export interface AnalyzeCommitOpts {
  trailDb: TrailDatabase;
  codeGraphService: CodeGraphService;
  gitRoot: string;
  /** 対象コミット。省略可能にしない（渡し忘れが「現在の断面を過去として保存」に化ける）。 */
  sha: string;
  /** 保存先リポジトリ名。`commit_code_graphs` の PK 構成列で、省略すると別リポへ書き得る。 */
  repoName: string;
  /** TS 解析の実行方式。release 経路と同じく省略不可。 */
  compute: AnalyzeComputeMode;
  /** グラフ内のリポジトリ名。省略時は gitRoot の basename を使う。 */
  repoLabel?: string;
  /** リポジトリあたりの保持本数。既定 30。 */
  retentionPerRepo?: number;
  logger?: Logger;
  onProgress?: (msg: string) => void;
}

export interface AnalyzeCommitResult {
  sha: string;
  nodeCount: number;
  edgeCount: number;
  durationMs: number;
}

/**
 * 指定コミット 1 本のコードグラフを生成して保存する（Snapshot per Commit）。
 *
 * **1 コミットのみ。** 複数指定も全量遡及も受けない（実測 5,102 コミット × 約 2 MB ≒ 10 GB）。
 * 指定 sha 以外のスナップショットは消さない。保持上限の超過分だけが古い順に落ちる。
 *
 * 失敗（tsconfig 欠如・当時の依存構成・不正な sha）は握りつぶさず throw する。release 経路は
 * 全量ループなので 1 タグの失敗を warn で流して続行するが、こちらは 1 件の要求に対する
 * 1 件の応答であり、失敗を成功と区別できないと UI が「生成したのに出ない」状態になる。
 */
export async function runAnalyzeCommitCodePipeline(
  opts: AnalyzeCommitOpts,
): Promise<AnalyzeCommitResult> {
  const { trailDb, codeGraphService, gitRoot, sha, repoName, compute, onProgress } = opts;
  const logger = opts.logger ?? NOOP_LOGGER;
  const repoLabel = opts.repoLabel || path.basename(gitRoot);
  const retentionPerRepo = opts.retentionPerRepo ?? DEFAULT_COMMIT_CODE_GRAPH_RETENTION;
  const startedAt = Date.now();
  // sha はそのままパスへ入るため、worktree 名に使う前にパス区切りを潰す。
  const worktreeRoot = path.join(os.tmpdir(), `trail-cg-commit-${sha.replaceAll('/', '-')}`);

  onProgress?.(`Generating code graph for commit ${sha.slice(0, 8)}...`);
  try {
    const graph = await generateCodeGraphAtCommit({
      codeGraphService,
      gitRoot,
      commitHash: sha,
      worktreeRoot,
      compute,
      repoLabel,
      logger,
    });
    if (!graph) {
      throw new Error(`no code graph generated for commit ${sha}`);
    }
    trailDb.saveCommitCodeGraph(sha, repoName, graph, retentionPerRepo);
    onProgress?.(`Commit ${sha.slice(0, 8)}: code graph saved`);
    return {
      sha,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    cleanupWorktree(gitRoot, worktreeRoot, logger);
  }
}
