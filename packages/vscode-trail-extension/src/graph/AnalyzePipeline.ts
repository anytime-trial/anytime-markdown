import * as path from 'node:path';

import { analyzeWithProgram } from '@anytime-markdown/trail-core/analyze';
import { ExecFileGitService } from '@anytime-markdown/trail-db';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { loadAnalyzeExclude, seedAnalyzeExclude } from '@anytime-markdown/trail-core/analyzeExclude';

import { TrailLogger } from '../utils/TrailLogger';
import type { TrailDataServer } from '../server/TrailDataServer';
import type { CodeGraphService } from './CodeGraphService';
import { GraphDetector } from './GraphDetector';

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

export interface AnalyzeCurrentOpts {
  analysisRoot: string;
  tsconfigPath: string;
  trailDb: TrailDatabase;
  trailDataServer: TrailDataServer;
  codeGraphService: CodeGraphService;
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
  const { analysisRoot, tsconfigPath, trailDb, trailDataServer, codeGraphService, onProgress } = opts;
  const startedAt = Date.now();
  const repoName = path.basename(analysisRoot);
  const warnings: string[] = [];

  trailDataServer.notifyProgress('Loading project...', 0);
  onProgress?.('Loading project...', 0);

  try {
    const seeded = seedAnalyzeExclude(analysisRoot);
    if (seeded) {
      TrailLogger.info(`C4 analysis [${repoName}]: .trail/analyze-exclude created`);
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
      TrailLogger.info(`C4 analysis [${repoName}]: ${phase}`);
      const percent = phasePercent(phase);
      trailDataServer.notifyProgress(phase, percent);
      onProgress?.(phase, percent);
    },
  });

  TrailLogger.info(
    `C4 analysis [${repoName}]: analyzed ${graph.metadata.fileCount} files, ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
  );

  let commitId = '';
  try {
    commitId = new ExecFileGitService(analysisRoot).getHeadCommit();
  } catch (err) {
    TrailLogger.warn(
      `C4 analysis [${repoName}]: getHeadCommit failed (not a git repo?): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  trailDb.saveCurrentGraph(graph, tsconfigPath, commitId, repoName);
  TrailLogger.info(
    `C4 analysis [${repoName}]: TrailGraph saved to current_graphs (repo=${repoName}, commit=${commitId || 'unknown'})`,
  );

  let importanceResult: Awaited<ReturnType<typeof trailDataServer.computeAndPersistImportance>> = null;
  try {
    onProgress?.('Computing importance scores...');
    // analyzeWithProgram で構築した Program を再利用する (Program 二重構築の回避)。
    // trail-core と vscode-trail-extension は別の typescript インスタンスを持つが、
    // ts.Program は構造的に互換 (バージョン 5.8.x / 5.9.x で API が安定) なので
    // unknown 経由でキャストする。
    importanceResult = await trailDataServer.computeAndPersistImportance(
      tsconfigPath,
      exclude,
      program as unknown as import('typescript').Program,
    );
    TrailLogger.info(`C4 analysis [${repoName}]: importance scores computed`);
  } catch (err) {
    const msg = `importance computation failed: ${err instanceof Error ? err.message : String(err)}`;
    TrailLogger.warn(`C4 analysis [${repoName}]: ${msg}`);
    warnings.push(msg);
  }

  try {
    onProgress?.('Generating code graph...');
    await codeGraphService.generate((phase, percent) => {
      trailDataServer.notifyCodeGraphProgress(phase, percent);
      onProgress?.(`Code graph: ${phase}`, percent);
    });
    // generate() は fresh graph で in-memory cache を上書きするため、
    // saveCurrentCodeGraph で温存された AI 要約は cache に反映されない。
    // loadFromDb() で DB と join 済みの graph を取り直し、要約込みで cache を再構築する。
    try {
      await codeGraphService.loadFromDb();
    } catch (err) {
      TrailLogger.warn(`C4 analysis [${repoName}]: cache compose failed (loadFromDb): ${err instanceof Error ? err.message : String(err)}`);
    }
    trailDataServer.notifyCodeGraphUpdated();
  } catch (err) {
    const msg = `code graph generation failed: ${err instanceof Error ? err.message : String(err)}`;
    TrailLogger.error(`C4 analysis [${repoName}]: ${msg}`, err);
    warnings.push(msg);
  }

  try {
    const count = trailDb.importCurrentCoverage(analysisRoot, repoName);
    TrailLogger.info(`C4 analysis [${repoName}]: current_coverage updated (${count} entries)`);
  } catch (err) {
    const msg = `importCurrentCoverage failed: ${err instanceof Error ? err.message : String(err)}`;
    TrailLogger.warn(`C4 analysis [${repoName}]: ${msg}`);
    warnings.push(msg);
  }

  // .trail/dead-code-ignore をシードする（初回のみ作成）
  try {
    onProgress?.('Seeding dead-code-ignore...');
    const { seedDeadCodeIgnore } = await import('@anytime-markdown/trail-core/deadCode');
    const seeded = seedDeadCodeIgnore(analysisRoot);
    if (seeded) {
      TrailLogger.info(`C4 analysis [${repoName}]: .trail/dead-code-ignore created`);
    }
  } catch (err) {
    warnings.push(`seedDeadCodeIgnore failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ファイル別・関数別デッドコード解析を current_file_analysis / current_function_analysis に保存
  try {
    onProgress?.('Computing file analysis...');
    if (importanceResult) {
      const { computeAndPersistFileAnalysis } = await import('./computeAndPersistFileAnalysis.js');
      const { fileRows, functionRows } = await computeAndPersistFileAnalysis({
        analysisRoot,
        repoName,
        trailDb,
        scored: importanceResult.scored,
        lineCountByFile: importanceResult.lineCountByFile,
      });
      TrailLogger.info(
        `C4 analysis [${repoName}]: file_analysis=${fileRows} function_analysis=${functionRows}`,
      );
    } else {
      TrailLogger.warn(`C4 analysis [${repoName}]: skipping file analysis (no importance result)`);
    }
  } catch (err) {
    const msg = `file analysis failed: ${err instanceof Error ? err.message : String(err)}`;
    TrailLogger.warn(`C4 analysis [${repoName}]: ${msg}`);
    warnings.push(msg);
  }

  trailDataServer.notifyProgress('', 100);
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
