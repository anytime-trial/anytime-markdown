// ---------------------------------------------------------------------------
// C4 Model 型定義（trail-core 内でローカルに定義）
// ---------------------------------------------------------------------------

export type C4ElementType = 'person' | 'system' | 'container' | 'containerDb' | 'component' | 'code';

export type C4Level = 'context' | 'container' | 'component' | 'code';

export interface C4Element {
  readonly id: string;
  readonly type: C4ElementType;
  readonly name: string;
  readonly description?: string;
  readonly technology?: string;
  readonly external?: boolean;
  readonly children?: readonly C4Element[];
  readonly boundaryId?: string;
}

export interface C4Relationship {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly technology?: string;
  readonly bidirectional?: boolean;
}

export interface C4Model {
  readonly title?: string;
  readonly level: C4Level;
  readonly elements: readonly C4Element[];
  readonly relationships: readonly C4Relationship[];
}
