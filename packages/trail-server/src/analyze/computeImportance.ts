import * as path from 'node:path';
import type { Ignore } from 'ignore';
import type { ScoredFunction } from '@anytime-markdown/trail-core/importance';

export interface ComputeImportanceResult {
  scored: ScoredFunction[];
  lineCountByFile: Map<string, number>;
}

/**
 * analyzeWithProgram が構築した ts.Program を使い importance を計算する純粋関数。
 * DB 書き込みは行わない。analyzer.analyze 失敗時は null を返す（呼び出し側で警告化）。
 */
export async function computeImportance(
  tsconfigPath: string,
  exclude: Ignore | undefined,
  program: import('typescript').Program,
): Promise<ComputeImportanceResult | null> {
  const { TypeScriptAdapter, ImportanceAnalyzer } = await import('@anytime-markdown/trail-core/importance');
  const adapter = TypeScriptAdapter.fromProgram(
    program as unknown as Parameters<typeof TypeScriptAdapter.fromProgram>[0],
  );
  const resolvedDir = path.dirname(path.resolve(tsconfigPath));
  const isExcluded = (sf: { isDeclarationFile: boolean; fileName: string }): boolean => {
    if (sf.isDeclarationFile || sf.fileName.includes('node_modules')) return true;
    if (!exclude) return false;
    const relPath = path.relative(resolvedDir, sf.fileName).split(path.sep).join('/');
    if (relPath === '' || relPath.startsWith('../')) return false;
    return exclude.ignores(relPath);
  };
  const allSourceFiles = adapter
    .getProgram()
    .getSourceFiles()
    .filter((sf) => !isExcluded(sf))
    .map((sf) => sf.fileName);
  const analyzer = new ImportanceAnalyzer(adapter);
  let scored: ScoredFunction[];
  try {
    scored = analyzer.analyze(allSourceFiles);
  } catch {
    return null;
  }
  const lineCountByFile = new Map<string, number>();
  for (const sf of adapter.getProgram().getSourceFiles()) {
    if (isExcluded(sf)) continue;
    const relPath = path.relative(resolvedDir, sf.fileName);
    const loc = sf.getLineAndCharacterOfPosition(sf.end).line + 1;
    lineCountByFile.set(relPath, loc);
  }
  return { scored, lineCountByFile };
}
