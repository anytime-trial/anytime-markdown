import ignore, { type Ignore } from 'ignore';
import type ts from 'typescript';

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

export interface AnalyzeWithProgramResult {
  readonly graph: TrailGraph;
  /**
   * 解析に使用した ts.Program。後段の ImportanceAnalyzer 等で再利用することで
   * 同一 tsconfig に対する Program の二重構築 (~数秒〜数十秒のコスト) を回避する。
   * 呼び出し側が解析パイプライン全体を保持している間は GC されない。
   */
  readonly program: ts.Program;
  readonly projectRoot: string;
}

/**
 * `analyze` と同じ解析を実行し、TrailGraph に加えて構築済みの ts.Program を返す。
 * 後段の Importance 解析等で同一 Program を共有したい場合に使う。
 */
export function analyzeWithProgram(options: AnalyzeOptions): AnalyzeWithProgramResult {
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

  const graph: TrailGraph = {
    nodes,
    edges,
    metadata: {
      projectRoot: analyzer.getProjectRoot(),
      analyzedAt: new Date().toISOString(),
      fileCount: nodes.filter(n => n.type === 'file').length,
    },
  };

  return { graph, program: analyzer.getProgram(), projectRoot: analyzer.getProjectRoot() };
}

export function analyze(options: AnalyzeOptions): TrailGraph {
  return analyzeWithProgram(options).graph;
}
