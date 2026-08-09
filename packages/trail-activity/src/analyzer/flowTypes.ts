// packages/trail-activity/src/analyzer/flowTypes.ts

export type FlowNodeKind =
  | 'start'
  | 'end'
  | 'process'
  | 'decision'
  | 'loop'
  | 'call'
  | 'return'
  | 'error';

export interface FlowNode {
  readonly id: string;
  readonly label: string;
  readonly kind: FlowNodeKind;
  readonly filePath?: string;
  readonly line?: number;
}

export interface FlowEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string; // decision の 'true' / 'false'
}

export interface FlowGraph {
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
}

export interface ExportedSymbol {
  readonly id: string;       // "src/auth/login.ts::login"
  readonly name: string;     // "login"
  readonly kind: 'function' | 'class' | 'method' | 'variable';
  readonly filePath: string; // 相対パス
  readonly line: number;
}
