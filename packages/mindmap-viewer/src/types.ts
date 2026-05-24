/** 外部公開用ノード型（内部 NodeType のうち追加入力不要な基本型のみ） */
export type GraphInputNodeType =
  | 'rect' | 'ellipse' | 'sticky' | 'text'
  | 'diamond' | 'parallelogram' | 'cylinder' | 'doc';

export interface GraphInputNode {
  /** 外部 ID。一意・非空。内部 node.id としてそのまま保持される */
  id: string;
  label: string;
  type?: GraphInputNodeType;
  fill?: string;
  /** 枠線色（R9 セマンティックスタイル） */
  stroke?: string;
  /** 枠線の太さ */
  strokeWidth?: number;
  fontColor?: string;
  doc?: string;
  metadata?: Record<string, string | number>;
}

export interface GraphInputEdge {
  from: string;
  to: string;
  label?: string;
  weight?: number;
}

export interface GraphInput {
  schemaVersion: '1.0';
  name?: string;
  rootId?: string;
  layout?: 'radial' | 'tree-lr' | 'tree-tb';
  nodes: GraphInputNode[];
  edges: GraphInputEdge[];
}

/** node-click イベントの detail。id は外部 GraphInputNode.id */
export interface NodeClickDetail {
  id: string;
  label?: string;
  metadata?: Record<string, string | number>;
}
