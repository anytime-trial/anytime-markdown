import type { TrailGraph } from '../model/types';
import type { LanguageAnalyzer, LanguageAnalyzeInput } from './LanguageAnalyzer';
import type { LanguageRegistry } from './LanguageRegistry';

/** 複数 TrailGraph を 1 つに統合する（ノード id はパス名前空間化済みで衝突しない前提）。 */
export function mergeTrailGraphs(graphs: readonly TrailGraph[], projectRoot: string): TrailGraph {
  const nodes = graphs.flatMap((g) => g.nodes);
  const edges = graphs.flatMap((g) => g.edges);
  return {
    nodes,
    edges,
    metadata: {
      projectRoot,
      analyzedAt: new Date().toISOString(),
      fileCount: nodes.filter((n) => n.type === 'file').length,
    },
  };
}

/** repoRoot で検出された全言語アナライザを init→analyze し、結果を union する。 */
export async function analyzeRepo(
  registry: LanguageRegistry,
  repoRoot: string,
  makeInput: (analyzer: LanguageAnalyzer) => LanguageAnalyzeInput,
): Promise<TrailGraph | undefined> {
  const analyzers = registry.detectAll(repoRoot);
  if (analyzers.length === 0) return undefined;
  const graphs: TrailGraph[] = [];
  for (const a of analyzers) {
    if (a.init) await a.init();
    graphs.push(a.analyze(makeInput(a)));
  }
  return mergeTrailGraphs(graphs, repoRoot);
}
