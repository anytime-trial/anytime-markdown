export type TrailNodeType =
  | 'file'
  | 'class'
  | 'interface'
  | 'function'
  | 'variable'
  | 'type'
  | 'enum'
  | 'namespace';

export type TrailEdgeType =
  | 'import'
  | 'call'
  | 'type_use'
  | 'inheritance'
  | 'implementation'
  | 'override';

export interface TrailNode {
  readonly id: string;
  readonly label: string;
  readonly type: TrailNodeType;
  readonly filePath: string;
  readonly line: number;
  readonly parent?: string;
}

export interface TrailEdge {
  readonly source: string;
  readonly target: string;
  readonly type: TrailEdgeType;
}

export interface TrailGraphMetadata {
  readonly projectRoot: string;
  readonly analyzedAt: string;
  readonly fileCount: number;
}

export interface TrailGraph {
  readonly nodes: readonly TrailNode[];
  readonly edges: readonly TrailEdge[];
  readonly metadata: TrailGraphMetadata;
}
