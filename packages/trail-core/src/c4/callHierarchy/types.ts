import type { TrailNode } from '../../model/types';

export type CallHierarchyDirection = 'callers' | 'callees';

export interface CallHierarchyNode {
  readonly id: string;
  readonly label: string;
  readonly filePath: string;
  readonly line: number;
  readonly role?: string;
  /** 祖先パス上に同 ID が出現したことを示す (例: A → B → A) */
  readonly cycle?: boolean;
  /** 祖先ではないが traverse 中に別ブランチで既出のため再展開を抑止したことを示す (DAG 再合流) */
  readonly revisited?: boolean;
  readonly children: CallHierarchyNode[];
}

export interface CallHierarchyTraverseOptions {
  /** ノード単位の絞り込み。false を返したノードは展開対象から除外され、グローバル visited にも入れない */
  readonly nodeFilter?: (node: TrailNode) => boolean;
}

export interface CallHierarchyIndex {
  readonly forward: Map<string, string[]>;
  readonly reverse: Map<string, string[]>;
  readonly nodes: Map<string, TrailNode>;
}
