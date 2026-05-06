import ignore, { type Ignore } from 'ignore';

import type { TrailGraph } from './model/types';
import type { FilterConfig } from './analyzer/FilterConfig';
import { ProjectAnalyzer } from './analyzer/ProjectAnalyzer';
import { SymbolExtractor } from './analyzer/SymbolExtractor';
import { EdgeExtractor } from './analyzer/EdgeExtractor';
import { applyFilter } from './analyzer/FilterConfig';

export interface AnalyzeOptions {
  readonly tsconfigPath: string;
  /**
   * `.gitignore` 互換の Ignore インスタンス。`loadAnalyzeExclude` の戻り値を
   * そのまま渡す想定。未指定時は空 Ignore（何も除外しない）。
   */
  readonly exclude?: Ignore;
  readonly includeTests?: boolean;
  /** 進捗通知コールバック（フェーズ名を受け取る） */
  readonly onProgress?: (phase: string) => void;
}

export function analyze(options: AnalyzeOptions): TrailGraph {
  const report = options.onProgress ?? (() => {});

  report('Loading project...');
  const analyzer = new ProjectAnalyzer(options.tsconfigPath);

  report('Extracting symbols...');
  const symbolExtractor = new SymbolExtractor(analyzer);
  const rawNodes = symbolExtractor.extract();

  report('Extracting dependencies...');
  const edgeExtractor = new EdgeExtractor(analyzer, rawNodes);
  const rawEdges = edgeExtractor.extract();

  report('Filtering results...');
  const filterConfig: FilterConfig = {
    exclude: options.exclude ?? ignore(),
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
