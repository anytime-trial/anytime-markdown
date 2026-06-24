import type { ArchitectureLayer } from '@anytime-markdown/trail-core/codeGraph';

/**
 * アーキテクチャ層 → C4 コンテナの自動シード（非破壊・冪等）。
 *
 * 設計判断（永続データ保護 / code-quality.md「副作用レビュー」準拠）:
 * - `c4_manual_elements` はユーザ編集可能な手動データ。**洗い替え・上書き・削除は一切しない**。
 * - ユーザ作成要素（serviceType !== AUTO_LAYER_SOURCE）が 1 件でもある repo はシードしない
 *   （ユーザがキュレーションした C4 モデルを尊重する）。
 * - シードする場合も、同名の auto コンテナが既にあれば作らない（冪等）。
 */

/** auto シードした層コンテナを識別するための serviceType マーカー。 */
export const AUTO_LAYER_SOURCE = 'auto-layer';

/** 冪等・非破壊判定に必要な最小の要素情報。 */
export interface SeededElement {
  readonly name: string;
  readonly type: string;
  readonly serviceType?: string;
}

/** seedLayerContainers が依存する TrailDatabase の最小インタフェース。 */
export interface LayerSeedDb {
  getManualElements(repoName: string): readonly SeededElement[];
  saveManualElement(
    repoName: string,
    input: {
      type: string;
      name: string;
      description?: string;
      external: boolean;
      parentId: string | null;
      serviceType?: string;
    },
  ): string;
}

export interface SeedLayerResult {
  /** 新規作成した層（コンテナ名）。 */
  readonly created: ArchitectureLayer[];
  /** シードを見送った理由（実行時は undefined）。 */
  readonly skipped?: 'user-elements-present';
}

/**
 * repo に層コンテナを冪等・非破壊にシードする。
 *
 * @param db        TrailDatabase（manual element の read/insert のみ使用）
 * @param repoName  対象リポジトリ名
 * @param layers    グラフに出現した層（重複可・順不同）
 */
export function seedLayerContainers(
  db: LayerSeedDb,
  repoName: string,
  layers: Iterable<ArchitectureLayer>,
): SeedLayerResult {
  const existing = db.getManualElements(repoName);

  // ユーザがキュレーションした要素があれば一切触れない（破壊防止の主ガード）。
  const hasUserElements = existing.some((e) => e.serviceType !== AUTO_LAYER_SOURCE);
  if (hasUserElements) {
    return { created: [], skipped: 'user-elements-present' };
  }

  const existingAutoNames = new Set(
    existing.filter((e) => e.serviceType === AUTO_LAYER_SOURCE).map((e) => e.name),
  );

  const created: ArchitectureLayer[] = [];
  for (const layer of new Set(layers)) {
    if (existingAutoNames.has(layer)) continue;
    db.saveManualElement(repoName, {
      type: 'container',
      name: layer,
      external: false,
      parentId: null,
      serviceType: AUTO_LAYER_SOURCE,
    });
    existingAutoNames.add(layer);
    created.push(layer);
  }
  return { created };
}
