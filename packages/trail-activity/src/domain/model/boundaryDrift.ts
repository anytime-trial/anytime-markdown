// Architectural Drift Detection のドメインモデル。
//
// 宣言された論理境界（パッケージ）と、コードグラフから導出した実装凝集
// （コミュニティ）のずれを表す。仕様は
// spec/31.trail/03.trail-activity/architectural-drift-detection.ja.md。
//
// 命名に boundary を含めるのは、既存の detect_drift（5 ソース間の意味的不一致・
// memory_drift_events）および CheckArchitecturalAlignment（設計書追随確認）と
// 字面で区別するためである。3 者は同名で呼ばれた結果、文書間で実装状態の矛盾を
// 生んだ経緯がある（spec/92.doctrine/glossary.ja.md）。

/** 判定の入力。コードグラフのノードから必要な 2 属性だけを取る。 */
export interface BoundaryDriftNode {
  /** 宣言された境界。すべてのノードが必ずいずれか 1 つに属する。 */
  readonly package: string;
  /** 導出された凝集。GraphClusterer が割り当てたコミュニティ id。 */
  readonly community: number;
}

/** 「どこと混ざっているか」の内訳。これが無いと警告を見ても対処できない。 */
export interface BoundaryDriftBreakdownEntry {
  /** boundary_spanning ではパッケージ名、package_fragmentation ではコミュニティ id の文字列表現。 */
  readonly key: string;
  readonly nodeCount: number;
}

/** 1 コミュニティが複数パッケージに跨る＝境界跨ぎの結合の塊。 */
export interface BoundarySpanningWarning {
  readonly kind: 'boundary_spanning';
  readonly communityId: number;
  /** 跨いでいる異なりパッケージ数。 */
  readonly spanCount: number;
  /** 最多パッケージのノード数 ÷ 総ノード数。低いほど実際に混ざり合っている。 */
  readonly dominance: number;
  readonly nodeCount: number;
  readonly severity: number;
  /** パッケージ別ノード数。降順。 */
  readonly breakdown: readonly BoundaryDriftBreakdownEntry[];
}

/** 1 パッケージが多数コミュニティに裂ける＝宣言境界の空洞化。 */
export interface PackageFragmentationWarning {
  readonly kind: 'package_fragmentation';
  readonly packageName: string;
  /** 属している異なりコミュニティ数。 */
  readonly communityCount: number;
  readonly nodeCount: number;
  readonly severity: number;
  /** コミュニティ別ノード数。降順。 */
  readonly breakdown: readonly BoundaryDriftBreakdownEntry[];
}

export type BoundaryDriftWarning = BoundarySpanningWarning | PackageFragmentationWarning;

export type BoundaryDriftKind = BoundaryDriftWarning['kind'];

export interface BoundaryDriftThresholds {
  /** これ以上のパッケージ数に跨ると boundary_spanning の候補になる。 */
  readonly minSpanCount: number;
  /** dominance がこれ未満のときだけ boundary_spanning とする。 */
  readonly maxDominance: number;
  /** これ以上のコミュニティ数に裂けると package_fragmentation になる。 */
  readonly minCommunityCount: number;
}

/**
 * 既定閾値。2026-08-02 の現行グラフ（141 コミュニティ / 2,429 ノード）で校正した。
 * この値で boundary_spanning 10 件 / package_fragmentation 6 件が警告となり、
 * 123 コミュニティ（87%）は単一パッケージに収まるため警告にならない。
 *
 * チューナブルな重み係数は導入しない（他リポへの移植性を保つため。
 * 20260510-architectural-centrality-design.ja.md と同じ方針）。
 */
export const DEFAULT_BOUNDARY_DRIFT_THRESHOLDS: BoundaryDriftThresholds = {
  minSpanCount: 3,
  maxDominance: 0.7,
  minCommunityCount: 10,
};
