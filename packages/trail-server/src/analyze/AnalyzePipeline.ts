import * as path from 'node:path';

import { analyzeWithProgram } from '@anytime-markdown/trail-core/analyze';
import { ExecFileGitService } from '@anytime-markdown/trail-db';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { loadAnalyzeExclude, seedAnalyzeExclude } from '@anytime-markdown/trail-core/analyzeExclude';
import { discoverPythonFiles } from '@anytime-markdown/code-analysis-python';

import type { Logger } from '../runtime/Logger';
import type { CodeGraphService } from './CodeGraphService';
import { GraphDetector } from './GraphDetector';

/**
 * AnalyzePipeline が呼び出し元 (TrailDataServer) の特定メソッドに依存するための契約。
 * 具象クラスへの逆方向依存を避けるため、必要な振る舞いだけを切り出している。
 */
export interface AnalyzePipelineCallbacks {
  notifyProgress(phase: string, percent: number): void;
  notifyCodeGraphProgress(phase: string, percent: number): void;
  notifyCodeGraphUpdated(): void;
  computeAndPersistImportance(
    tsconfigPath: string,
    exclude: import('ignore').Ignore | undefined,
    program: import('typescript').Program,
  ): Promise<{
    scored: import('@anytime-markdown/trail-core/importance').ScoredFunction[];
    fileAggregates: Map<string, import('@anytime-markdown/trail-core/deadCode').FileImportanceAggregate>;
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

export interface TsconfigCandidate {
  fsPath: string;
  rel: string;
  depth: number;
}

/**
 * `analysisRoot` 配下から `tsconfig.json` 候補を浅い順に返す。
 * 複数ある場合の選択は呼び出し側の責務（コマンドは QuickPick、HTTP は 1 件目）。
 */
export function findTsconfigCandidates(analysisRoot: string): TsconfigCandidate[] {
  return new GraphDetector(analysisRoot, loadAnalyzeExclude(analysisRoot))
    .detectFilesByName('tsconfig.json')
    .map((fsPath) => {
      const rel = path.relative(analysisRoot, fsPath);
      return { fsPath, rel, depth: rel.split(path.sep).length };
    })
    .sort((a, b) => (a.depth !== b.depth ? a.depth - b.depth : a.rel.localeCompare(b.rel)));
}

/**
 * `analysisRoot` 配下に解析対象の Python ファイルが存在するか。
 * tsconfig が無い場合に Python-only 解析へフォールバックするかの判定に使う。
 * analyze-exclude を反映する（discoverPythonFiles が exclude を受け取る）。
 */
export function hasPythonFiles(analysisRoot: string): boolean {
  return discoverPythonFiles(analysisRoot, loadAnalyzeExclude(analysisRoot)).length > 0;
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
  tsconfigPath: string;
  trailDb: TrailDatabase;
  callbacks: AnalyzePipelineCallbacks;
  codeGraphService: CodeGraphService;
  /** Logger instance. Defaults to a no-op logger if not provided. */
  logger?: Logger;
  /** UI 側（VS Code progress）の進捗コールバック。HTTP 経路では未指定。 */
  onProgress?: (phase: string, percent?: number) => void;
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

/**
 * C4 / コードグラフ解析の本体パイプライン。
 * VS Code コマンド (`anytime-trail.analyzeCurrentCode`) と HTTP エンドポイント
 * (`POST /api/analyze/current`) の両方から呼び出される。
 *
 * UI 専用処理（QuickPick・vscode.window.withProgress・showInformationMessage）は
 * 含まない。それらは呼び出し側で実装する。
 */
export async function runAnalyzeCurrentCodePipeline(
  opts: AnalyzeCurrentOpts,
): Promise<AnalyzeCurrentResult> {
  const { analysisRoot, tsconfigPath, trailDb, callbacks, codeGraphService, onProgress } = opts;
  const logger = opts.logger ?? NOOP_LOGGER;
  const startedAt = Date.now();
  const repoName = path.basename(analysisRoot);
  const warnings: string[] = [];

  callbacks.notifyProgress('Loading project...', 0);
  onProgress?.('Loading project...', 0);

  try {
    const seeded = seedAnalyzeExclude(analysisRoot);
    if (seeded) {
      logger.info(`C4 analysis [${repoName}]: .anytime/analyze-exclude created`);
    }
  } catch (err) {
    warnings.push(`seedAnalyzeExclude failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const exclude = loadAnalyzeExclude(analysisRoot);
  // Program を保持して後段の computeAndPersistImportance で再利用する。
  // これにより同一 tsconfig に対する ts.Program の二重構築 (~数秒〜数十秒) を回避し、
  // かつ analyze() と Importance 解析の対象ファイル集合が完全一致する
  // (両者が同じ Program を見るため C4 model と file-analysis の drift が原理的に起きない)。
  const { graph, program } = analyzeWithProgram({
    tsconfigPath,
    exclude,
    onProgress: (phase) => {
      logger.info(`C4 analysis [${repoName}]: ${phase}`);
      const percent = phasePercent(phase);
      callbacks.notifyProgress(phase, percent);
      onProgress?.(phase, percent);
    },
  });

  logger.info(
    `C4 analysis [${repoName}]: analyzed ${graph.metadata.fileCount} files, ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
  );

  let commitId = '';
  try {
    commitId = new ExecFileGitService(analysisRoot).getHeadCommit();
  } catch (err) {
    logger.warn(
      `C4 analysis [${repoName}]: getHeadCommit failed (not a git repo?): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  trailDb.saveCurrentGraph(graph, tsconfigPath, commitId, repoName);
  logger.info(
    `C4 analysis [${repoName}]: TrailGraph saved to current_graphs (repo=${repoName}, commit=${commitId || 'unknown'})`,
  );

  let importanceResult: Awaited<ReturnType<AnalyzePipelineCallbacks['computeAndPersistImportance']>> = null;
  try {
    onProgress?.('Computing importance scores...');
    // analyzeWithProgram で構築した Program を再利用する (Program 二重構築の回避)。
    // trail-core と vscode-trail-extension は別の typescript インスタンスを持つが、
    // ts.Program は構造的に互換 (バージョン 5.8.x / 5.9.x で API が安定) なので
    // unknown 経由でキャストする。
    importanceResult = await callbacks.computeAndPersistImportance(
      tsconfigPath,
      exclude,
      program as unknown as import('typescript').Program,
    );
    logger.info(`C4 analysis [${repoName}]: importance scores computed`);
  } catch (err) {
    const msg = `importance computation failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.warn(`C4 analysis [${repoName}]: ${msg}`);
    warnings.push(msg);
  }

  try {
    onProgress?.('Generating code graph...');
    await codeGraphService.generate((phase, percent) => {
      callbacks.notifyCodeGraphProgress(phase, percent);
      onProgress?.(`Code graph: ${phase}`, percent);
    });
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

  // ファイル別・関数別デッドコード解析を current_file_analysis / current_function_analysis に保存
  try {
    onProgress?.('Computing file analysis...');
    if (importanceResult) {
      // C4 architecture overlay 用に各ファイルを UI / Logic に分類する。
      // analyzeWithProgram で構築した program を再利用するため追加コストは AST 走査のみ。
      const { classifyAllFiles } = await import('@anytime-markdown/trail-core/classify');
      const categoryByFile = classifyAllFiles(
        program as unknown as import('typescript').Program,
        analysisRoot,
      );
      logger.info(
        `C4 analysis [${repoName}]: classified ${categoryByFile.size} files (ui/logic/excluded)`,
      );

      // Phase 2 方針 A: 混在リポ（tsconfig あり + .py あり）で Python importance を結合する。
      // TS scored（program ベース）はそのまま、Python ファイルがあれば PythonAdapter で
      // 算出した ScoredFunction(language='python') を追記し、同一の永続化へ流す。
      let scored = importanceResult.scored;
      let lineCountByFile: ReadonlyMap<string, number> = importanceResult.lineCountByFile;
      try {
        const { computePythonImportance } = await import('./computePythonImportance.js');
        const py = await computePythonImportance({
          repoRoot: analysisRoot,
          exclude,
          pythonWasmPath: codeGraphService.getPythonWasmPath(),
          logger,
        });
        if (py.scored.length > 0) {
          scored = [...importanceResult.scored, ...py.scored];
          const merged = new Map(importanceResult.lineCountByFile);
          for (const [rel, count] of py.lineCountByFile) merged.set(rel, count);
          lineCountByFile = merged;
          logger.info(
            `C4 analysis [${repoName}]: python importance computed (${py.scored.length} functions)`,
          );
        }
      } catch (err) {
        const msg = `python importance failed: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn(`C4 analysis [${repoName}]: ${msg}`);
        warnings.push(msg);
      }

      const { computeAndPersistFileAnalysis } = await import('./computeAndPersistFileAnalysis.js');
      const { fileRows, functionRows } = await computeAndPersistFileAnalysis({
        analysisRoot,
        repoName,
        trailDb,
        scored,
        lineCountByFile,
        categoryByFile,
      });
      logger.info(
        `C4 analysis [${repoName}]: file_analysis=${fileRows} function_analysis=${functionRows}`,
      );
    } else {
      logger.warn(`C4 analysis [${repoName}]: skipping file analysis (no importance result)`);
    }
  } catch (err) {
    const msg = `file analysis failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.warn(`C4 analysis [${repoName}]: ${msg}`);
    warnings.push(msg);
  }

  callbacks.notifyProgress('', 100);
  onProgress?.('', 100);

  return {
    repoName,
    tsconfigPath,
    fileCount: graph.metadata.fileCount,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
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
