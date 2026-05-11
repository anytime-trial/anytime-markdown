import type { TrailNode } from '../../model/types';

export type CallHierarchyDirection = 'callers' | 'callees';

export interface CallHierarchyNode {
  readonly id: string;
  readonly label: string;
  readonly filePath: string;
  readonly line: number;
  readonly role?: string;
  readonly cycle?: boolean;
  readonly children: CallHierarchyNode[];
}

export interface CallHierarchyIndex {
  readonly forward: Map<string, string[]>;
  readonly reverse: Map<string, string[]>;
  readonly nodes: Map<string, TrailNode>;
}
