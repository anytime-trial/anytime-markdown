/** DSMノード（マトリクスの行/列に対応） */
export interface DsmNode {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly level: 'component' | 'package';
}

/** import の詳細情報 */
export interface ImportDetail {
  readonly filePath: string;
  readonly line: number;
  readonly specifier: string;
}

/** DSMエッジ（依存関係） */
export interface DsmEdge {
  readonly source: string;
  readonly target: string;
  readonly imports: readonly ImportDetail[];
}

/** DSMマトリクス */
export interface DsmMatrix {
  readonly nodes: readonly DsmNode[];
  readonly edges: readonly DsmEdge[];
  readonly adjacency: readonly (readonly number[])[];
}

/** 循環依存ペア */
export interface CyclicPair {
  readonly nodeA: string;
  readonly nodeB: string;
}
