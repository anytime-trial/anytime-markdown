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

/** セルの状態（比較結果） */
export type DsmCellState =
  | 'match'
  | 'design_only'
  | 'impl_only'
  | 'none';

/** 差分マトリクスのセル */
export interface DsmDiffCell {
  readonly state: DsmCellState;
}

/** 循環依存ペア */
export interface CyclicPair {
  readonly nodeA: string;
  readonly nodeB: string;
}

/** DSM差分結果 */
export interface DsmDiff {
  readonly nodes: readonly DsmNode[];
  readonly cells: readonly (readonly DsmDiffCell[])[];
  readonly cyclicPairs: readonly CyclicPair[];
}

/** C4要素とソースパスの対応 */
export interface DsmMapping {
  readonly c4ElementId: string;
  readonly sourcePath: string;
}
