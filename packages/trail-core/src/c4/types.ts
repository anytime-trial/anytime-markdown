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
  /** 手動追加された要素か */
  readonly manual?: boolean;
  /** ワークスペース解析で検出されなくなった要素か */
  readonly deleted?: boolean;
}

/** C4リレーションシップ */
export interface C4Relationship {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly technology?: string;
  /** 双方向か */
  readonly bidirectional?: boolean;
  /** 手動追加された関係か */
  readonly manual?: boolean;
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

// ---------------------------------------------------------------------------
//  Feature Matrix
// ---------------------------------------------------------------------------

/** 機能カテゴリ */
export interface FeatureCategory {
  readonly id: string;
  readonly name: string;
}

/** 機能領域 */
export interface Feature {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
}

/** 機能と要素の対応（P=主担当, S=補助, D=依存先） */
export type FeatureRole = 'primary' | 'secondary' | 'dependency';

/** 機能と C4 要素のマッピング */
export interface FeatureMapping {
  readonly featureId: string;
  /** C4 要素の ID（container or component） */
  readonly elementId: string;
  readonly role: FeatureRole;
}

/** 機能・構成マトリックス */
export interface FeatureMatrix {
  readonly categories: readonly FeatureCategory[];
  readonly features: readonly Feature[];
  readonly mappings: readonly FeatureMapping[];
}

// ---------------------------------------------------------------------------
//  Document Links
// ---------------------------------------------------------------------------

/** C4要素に紐づくドキュメントリンク */
export interface DocLink {
  readonly title: string;
  readonly type: string;
  readonly path: string;
  readonly c4Scope: readonly string[];
  readonly date: string;
}

/** ツリー表示用のノード */
export interface C4TreeNode {
  readonly id: string;
  readonly name: string;
  readonly type: C4ElementType | 'boundary';
  readonly external?: boolean;
  readonly technology?: string;
  readonly description?: string;
  readonly deleted?: boolean;
  readonly children: readonly C4TreeNode[];
}

// ---------------------------------------------------------------------------
//  Coverage types
// ---------------------------------------------------------------------------

export interface CoverageMetric {
  readonly covered: number;
  readonly total: number;
  readonly pct: number;
}

export interface CoverageEntry {
  readonly elementId: string;
  readonly lines: CoverageMetric;
  readonly branches: CoverageMetric;
  readonly functions: CoverageMetric;
}

export interface CoverageMatrix {
  readonly entries: readonly CoverageEntry[];
  readonly generatedAt: number;
}

export interface CoverageDelta {
  readonly pctDelta: number;
}

export interface CoverageDiffEntry {
  readonly elementId: string;
  readonly lines: CoverageDelta;
  readonly branches: CoverageDelta;
  readonly functions: CoverageDelta;
}

export interface CoverageDiffMatrix {
  readonly entries: readonly CoverageDiffEntry[];
  readonly baseGeneratedAt: number;
  readonly currentGeneratedAt: number;
}

/**
 * C4 ビューのリリースパネルに表示するエントリ。
 * tag は trail_graphs のスナップショット ID（'current' を含む）。
 * repoName が null の場合はリポジトリ未紐付け（'current' など）。
 */
export interface C4ReleaseEntry {
  readonly tag: string;
  readonly repoName: string | null;
}

// ---------------------------------------------------------------------------
//  Metric overlay types
// ---------------------------------------------------------------------------

/** C4グラフノードに適用できる色分け指標 */
export type MetricOverlay =
  | 'none'
  | 'coverage-lines'
  | 'coverage-branches'
  | 'coverage-functions'
  | 'dsm-out'
  | 'dsm-in'
  | 'dsm-cyclic'
  | 'complexity-most'
  | 'complexity-highest'
  | 'importance';

/** 複雑度分類（classifyByFeatures の label に対応） */
export type ComplexityClass =
  | 'low-complexity'
  | 'search-only'
  | 'multi-file-edit'
  | 'high-complexity';

/** 要素別複雑度集計エントリ */
export interface ComplexityEntry {
  readonly elementId: string;
  /** 最多分類（同率の場合は高い方を優先） */
  readonly mostFrequent: ComplexityClass;
  /** 最高分類（high > multi-file-edit > search-only > low） */
  readonly highest: ComplexityClass;
  readonly totalCount: number;
}

/** 要素別複雑度マトリクス */
export interface ComplexityMatrix {
  readonly entries: readonly ComplexityEntry[];
  readonly generatedAt: number;
}
