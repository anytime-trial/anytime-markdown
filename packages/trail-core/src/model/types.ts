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

/**
 * Import エッジの種別。type === 'import' の TrailEdge でのみ意味を持つ。
 * - static: `import X from 'Y'` / `import { A } from 'Y'` / `import 'Y'` など静的 import
 * - dynamic: `import('Y')` 式による動的 import（Next.js dynamic / React.lazy 等）
 * - reexport: `export { X } from 'Y'` / `export * from 'Y'` など再エクスポート
 * - type: `import type { X } from 'Y'` / `type T = import('Y').X` / `export type ... from` 型のみ参照
 */
export type ImportKind = 'static' | 'dynamic' | 'reexport' | 'type';

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
  /** type === 'import' のエッジで、どの構文から抽出されたかを示す。他の type では undefined */
  readonly importKind?: ImportKind;
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
