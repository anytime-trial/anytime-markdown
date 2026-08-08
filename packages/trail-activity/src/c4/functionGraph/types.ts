/**
 * L5 (関数レベル) で描画するノード。
 * - kind='function': 対象 C4 要素 (ファイル) 配下の関数ノード
 * - kind='external': 対象外のファイルにある呼び出し先関数 (グレー表示)
 * - kind='external_caller': 対象外のファイルからの呼び出し元 (グレー表示)
 */
export interface FunctionGraphNode {
  readonly id: string;
  readonly label: string;
  readonly filePath: string;
  readonly line: number;
  readonly kind: 'function' | 'external' | 'external_caller';
  /** function ノードのみ。FunctionRole が解決できなければ undefined */
  readonly role?: 'primary' | 'secondary' | 'utility' | 'excluded';
  /** importance スコア。解決できなければ undefined */
  readonly importance?: number;
}

export interface FunctionGraphEdge {
  readonly source: string;
  readonly target: string;
}

export interface FunctionGraphResponse {
  readonly elementId: string;
  readonly nodes: readonly FunctionGraphNode[];
  readonly edges: readonly FunctionGraphEdge[];
}
