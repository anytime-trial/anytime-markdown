import type { C4Model, FeatureMapping, FeatureMatrix } from './types';

/**
 * FeatureMatrix の container レベルマッピングを component レベルに展開する。
 *
 * 各 container マッピングに対し、`boundaryId` で紐づく配下 component に
 * 同じ role でマッピングを追加する。
 * - `packages` コンポーネント（re-export バレル）は除外
 * - 既存の component マッピングとの重複は追加しない
 */
export function enrichFeatureMatrixWithComponents(
  fm: FeatureMatrix,
  model: C4Model,
): FeatureMatrix {
  if (fm.mappings.length === 0) return fm;

  // container → component[] マップを構築（packages を除外）
  const childrenByContainer = new Map<string, readonly string[]>();
  const containerIds = new Set(
    model.elements.filter(e => e.type === 'container' || e.type === 'containerDb').map(e => e.id),
  );

  for (const cid of containerIds) {
    const children = model.elements.filter(
      e => e.type === 'component' && e.boundaryId === cid && e.name !== 'packages',
    );
    if (children.length > 0) {
      childrenByContainer.set(cid, children.map(c => c.id));
    }
  }

  // 既存マッピングのキーセット（重複排除用）
  const existingKeys = new Set(fm.mappings.map(m => `${m.featureId}:${m.elementId}`));

  const newMappings: FeatureMapping[] = [];

  for (const mapping of fm.mappings) {
    const children = childrenByContainer.get(mapping.elementId);
    if (!children) continue;

    for (const childId of children) {
      const key = `${mapping.featureId}:${childId}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      newMappings.push({
        featureId: mapping.featureId,
        elementId: childId,
        role: mapping.role,
      });
    }
  }

  if (newMappings.length === 0) return fm;

  return {
    categories: fm.categories,
    features: fm.features,
    mappings: [...fm.mappings, ...newMappings],
  };
}
