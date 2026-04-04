import type { TrailGraph } from './model/types';
import type { FilterConfig } from './analyzer/FilterConfig';
import { ProjectAnalyzer } from './analyzer/ProjectAnalyzer';
import { SymbolExtractor } from './analyzer/SymbolExtractor';
import { EdgeExtractor } from './analyzer/EdgeExtractor';
import { applyFilter } from './analyzer/FilterConfig';

export interface AnalyzeOptions {
  readonly tsconfigPath: string;
  readonly exclude?: readonly string[];
  readonly includeTests?: boolean;
}

export function analyze(options: AnalyzeOptions): TrailGraph {
  const analyzer = new ProjectAnalyzer(options.tsconfigPath);

  const symbolExtractor = new SymbolExtractor(analyzer);
  const rawNodes = symbolExtractor.extract();

  const edgeExtractor = new EdgeExtractor(analyzer, rawNodes);
  const rawEdges = edgeExtractor.extract();

  const filterConfig: FilterConfig = {
    exclude: options.exclude ?? [],
    includeTests: options.includeTests ?? false,
  };

  const { nodes, edges } = applyFilter(rawNodes, rawEdges, filterConfig);

  return {
    nodes,
    edges,
    metadata: {
      projectRoot: analyzer.getProjectRoot(),
      analyzedAt: new Date().toISOString(),
      fileCount: nodes.filter(n => n.type === 'file').length,
    },
  };
}
