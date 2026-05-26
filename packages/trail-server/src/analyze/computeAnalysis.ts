import { analyzeWithProgram } from '@anytime-markdown/trail-core/analyze';
import { loadAnalyzeExclude } from '@anytime-markdown/trail-core/analyzeExclude';
import { classifyPythonFiles } from '@anytime-markdown/code-analysis-python';
import type { ScoredFunction } from '@anytime-markdown/trail-core/importance';
import { computeImportance } from './computeImportance';
import type { AnalyzeChildRequest, AnalyzeComputeResult } from './analyzeChildProtocol';

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

  let scored: ScoredFunction[] = [];
  let lineCountByFile = new Map<string, number>();
  const imp = await computeImportance(
    tsconfigPath,
    exclude,
    program,
  );
  if (imp) {
    scored = imp.scored;
    lineCountByFile = imp.lineCountByFile;
  } else {
    warnings.push('importance computation returned null');
  }

  const { classifyAllFiles } = await import('@anytime-markdown/trail-core/classify');
  const categoryByFile = classifyAllFiles(
    program,
    analysisRoot,
  );
  try {
    const pyCategories = await classifyPythonFiles({ repoRoot: analysisRoot, exclude, pythonWasmPath });
    for (const [rel, cat] of pyCategories) categoryByFile.set(rel, cat);
  } catch (err) {
    warnings.push(`python classify failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const { computePythonImportance } = await import('./computePythonImportance.js');
    const py = await computePythonImportance({ repoRoot: analysisRoot, exclude, pythonWasmPath });
    if (py.scored.length > 0) {
      scored = [...scored, ...py.scored];
      for (const [k, v] of py.lineCountByFile) lineCountByFile.set(k, v);
    }
  } catch (err) {
    warnings.push(`python importance failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    graph,
    scored,
    lineCountByFile: [...lineCountByFile.entries()],
    categoryByFile: [...categoryByFile.entries()],
    warnings,
  };
}
