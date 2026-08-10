import { analyzeWithProgram } from '@anytime-markdown/trail-activity/analyze';
import { loadAnalyzeExclude } from '@anytime-markdown/trail-activity/analyzeExclude';
import { classifyPythonFiles } from '@anytime-markdown/code-analysis-python';
import type { ScoredFunction } from '@anytime-markdown/trail-activity/importance';
import { computeImportance } from './computeImportance';
import type { AnalyzeChildRequest, AnalyzeComputeResult, DecisionComment } from './analyzeChildProtocol';

/** Python 経路の解析（分類・importance）へ渡す共通パラメータ。 */
interface PythonAnalyzeParams {
  readonly repoRoot: string;
  readonly exclude: ReturnType<typeof loadAnalyzeExclude>;
  readonly pythonWasmPath?: string;
}

/** computeAnalysis 内で Python 経路のマージによって更新される可変の集計。 */
interface AnalysisAccumulator {
  scored: ScoredFunction[];
  lineCountByFile: Map<string, number>;
  readonly warnings: string[];
}

/** best-effort な失敗を warnings へ載せるためのメッセージ整形。 */
function formatFailure(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Python ファイル分類。失敗しても解析全体は止めず warnings へ退避し空 Map を返す（best-effort）。 */
async function classifyPythonSafely(
  params: PythonAnalyzeParams,
  warnings: string[],
): Promise<Awaited<ReturnType<typeof classifyPythonFiles>>> {
  try {
    return await classifyPythonFiles(params);
  } catch (err) {
    warnings.push(`python classify failed: ${formatFailure(err)}`);
    return new Map();
  }
}

/** Python の importance を既存の scored / lineCountByFile へマージする（失敗は warnings へ退避）。 */
async function mergePythonImportance(
  acc: AnalysisAccumulator,
  params: PythonAnalyzeParams,
): Promise<void> {
  try {
    const { computePythonImportance } = await import('./computePythonImportance.js');
    const py = await computePythonImportance(params);
    if (py.scored.length > 0) {
      acc.scored = [...acc.scored, ...py.scored];
      for (const [k, v] of py.lineCountByFile) acc.lineCountByFile.set(k, v);
    }
  } catch (err) {
    acc.warnings.push(`python importance failed: ${formatFailure(err)}`);
  }
}

/**
 * decision comment（WHY/RATIONALE/理由）抽出。trail-caravan-book は typescript を持たないため、
 * ts.Program を持つ本プロセス（analyze-child）で走査し結果を返す（trail-db 経由で memory が読む）。
 * 失敗は warnings へ退避し undefined を返す（best-effort）。
 */
async function scanDecisionCommentsSafely(
  program: ReturnType<typeof analyzeWithProgram>['program'],
  analysisRoot: string,
  warnings: string[],
): Promise<DecisionComment[] | undefined> {
  try {
    const { scanDecisionComments } = await import('./scanDecisionComments.js');
    return scanDecisionComments(program, analysisRoot);
  } catch (err) {
    warnings.push(`decision comment scan failed: ${formatFailure(err)}`);
    return undefined;
  }
}

/**
 * TS 経路の純粋計算。analyzeWithProgram + importance + classify + Python マージを行い、
 * シリアライズ可能な AnalyzeComputeResult を返す。DB 書き込み・vscode 依存を含まないため
 * 子プロセス (analyzeChildEntry) からそのまま呼べる。
 */
export async function computeAnalysis(
  req: AnalyzeChildRequest,
  onProgress?: (phase: string, percent: number) => void,
): Promise<AnalyzeComputeResult> {
  const { analysisRoot, tsconfigPath, pythonWasmPath } = req;
  const warnings: string[] = [];
  const exclude = loadAnalyzeExclude(req.excludeRoot ?? analysisRoot);

  const { graph, program } = analyzeWithProgram({
    tsconfigPath,
    exclude,
    onProgress: (phase) => onProgress?.(phase, 0),
  });

  const acc: AnalysisAccumulator = { scored: [], lineCountByFile: new Map<string, number>(), warnings };
  const imp = await computeImportance(
    tsconfigPath,
    exclude,
    program,
  );
  if (imp) {
    acc.scored = imp.scored;
    acc.lineCountByFile = imp.lineCountByFile;
  } else {
    warnings.push('importance computation returned null');
  }

  const { classifyAllFiles } = await import('@anytime-markdown/trail-activity/classify');
  const categoryByFile = classifyAllFiles(
    program,
    analysisRoot,
  );
  const pythonParams: PythonAnalyzeParams = { repoRoot: analysisRoot, exclude, pythonWasmPath };
  for (const [rel, cat] of await classifyPythonSafely(pythonParams, warnings)) {
    categoryByFile.set(rel, cat);
  }

  await mergePythonImportance(acc, pythonParams);

  let decisionComments: DecisionComment[] | undefined;
  if (req.includeDecisionComments) {
    decisionComments = await scanDecisionCommentsSafely(program, analysisRoot, warnings);
  }

  return {
    graph,
    scored: acc.scored,
    lineCountByFile: [...acc.lineCountByFile.entries()],
    categoryByFile: [...categoryByFile.entries()],
    decisionComments,
    warnings,
  };
}
