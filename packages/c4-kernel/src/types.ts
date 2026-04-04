/** C4要素の種別 */
export type C4ElementType = 'person' | 'system' | 'container' | 'containerDb' | 'component' | 'code';

/** C4図のレベル */
export type C4Level = 'context' | 'container' | 'component' | 'code';

/** C4要素 */
export interface C4Element {
  readonly id: string;
  readonly type: C4ElementType;
  readonly name: string;
  readonly description?: string;
  readonly technology?: string;
  /** 外部システムか */
  readonly external?: boolean;
  /** 下位レベルの要素 */
  readonly children?: readonly C4Element[];
  /** 境界（親要素ID） */
  readonly boundaryId?: string;
}

/** C4リレーションシップ */
export interface C4Relationship {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly technology?: string;
  /** 双方向か */
  readonly bidirectional?: boolean;
}

/** C4モデル全体 */
export interface C4Model {
  readonly title?: string;
  readonly level: C4Level;
  readonly elements: readonly C4Element[];
  readonly relationships: readonly C4Relationship[];
}

/** 境界情報（パーサーから受け取る） */
export interface BoundaryInfo {
  readonly id: string;
  readonly name: string;
}

/** ツリー表示用のノード */
export interface C4TreeNode {
  readonly id: string;
  readonly name: string;
  readonly type: C4ElementType | 'boundary';
  readonly external?: boolean;
  readonly technology?: string;
  readonly description?: string;
  readonly children: readonly C4TreeNode[];
}
