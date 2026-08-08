import { enrichFeatureMatrixWithComponents } from '../featureMatrix';
import type { C4Element, C4Model, FeatureMatrix } from '../types';

function container(id: string): C4Element {
  return { id, type: 'container', name: id };
}

function component(id: string, boundaryId: string, name?: string): C4Element {
  return { id, type: 'component', name: name ?? id.split('/').at(-1)!, boundaryId };
}

function makeModel(elements: C4Element[]): C4Model {
  return { level: 'component', elements, relationships: [] };
}

describe('enrichFeatureMatrixWithComponents', () => {
  it('container マッピングを配下の component に展開する', () => {
    const model = makeModel([
      container('pkg_a'),
      component('pkg_a/hooks', 'pkg_a'),
      component('pkg_a/utils', 'pkg_a'),
    ]);
    const fm: FeatureMatrix = {
      categories: [{ id: 'cat1', name: 'Cat1' }],
      features: [{ id: 'f1', name: 'Feature1', categoryId: 'cat1' }],
      mappings: [{ featureId: 'f1', elementId: 'pkg_a', role: 'primary' }],
    };

    const result = enrichFeatureMatrixWithComponents(fm, model);

    expect(result.mappings).toContainEqual({ featureId: 'f1', elementId: 'pkg_a/hooks', role: 'primary' });
    expect(result.mappings).toContainEqual({ featureId: 'f1', elementId: 'pkg_a/utils', role: 'primary' });
    // 元の container マッピングも保持
    expect(result.mappings).toContainEqual({ featureId: 'f1', elementId: 'pkg_a', role: 'primary' });
  });

  it('packages コンポーネント（re-export バレル）を除外する', () => {
    const model = makeModel([
      container('pkg_a'),
      component('pkg_a/packages', 'pkg_a', 'packages'),
      component('pkg_a/hooks', 'pkg_a'),
    ]);
    const fm: FeatureMatrix = {
      categories: [{ id: 'cat1', name: 'Cat1' }],
      features: [{ id: 'f1', name: 'Feature1', categoryId: 'cat1' }],
      mappings: [{ featureId: 'f1', elementId: 'pkg_a', role: 'secondary' }],
    };

    const result = enrichFeatureMatrixWithComponents(fm, model);

    const elementIds = result.mappings.map(m => m.elementId);
    expect(elementIds).not.toContain('pkg_a/packages');
    expect(elementIds).toContain('pkg_a/hooks');
  });

  it('既存の component マッピングと重複しない', () => {
    const model = makeModel([
      container('pkg_a'),
      component('pkg_a/hooks', 'pkg_a'),
      component('pkg_a/utils', 'pkg_a'),
    ]);
    const fm: FeatureMatrix = {
      categories: [{ id: 'cat1', name: 'Cat1' }],
      features: [{ id: 'f1', name: 'Feature1', categoryId: 'cat1' }],
      mappings: [
        { featureId: 'f1', elementId: 'pkg_a', role: 'primary' },
        { featureId: 'f1', elementId: 'pkg_a/hooks', role: 'primary' },
      ],
    };

    const result = enrichFeatureMatrixWithComponents(fm, model);

    const hooksCount = result.mappings.filter(
      m => m.featureId === 'f1' && m.elementId === 'pkg_a/hooks',
    ).length;
    expect(hooksCount).toBe(1);
  });

  it('複数の role を正しく展開する', () => {
    const model = makeModel([
      container('pkg_a'),
      component('pkg_a/ext', 'pkg_a'),
      container('pkg_b'),
      component('pkg_b/lib', 'pkg_b'),
    ]);
    const fm: FeatureMatrix = {
      categories: [{ id: 'cat1', name: 'Cat1' }],
      features: [{ id: 'f1', name: 'Feature1', categoryId: 'cat1' }],
      mappings: [
        { featureId: 'f1', elementId: 'pkg_a', role: 'primary' },
        { featureId: 'f1', elementId: 'pkg_b', role: 'dependency' },
      ],
    };

    const result = enrichFeatureMatrixWithComponents(fm, model);

    expect(result.mappings).toContainEqual({ featureId: 'f1', elementId: 'pkg_a/ext', role: 'primary' });
    expect(result.mappings).toContainEqual({ featureId: 'f1', elementId: 'pkg_b/lib', role: 'dependency' });
  });

  it('featureMatrix のマッピングが空の場合はそのまま返す', () => {
    const model = makeModel([container('pkg_a'), component('pkg_a/hooks', 'pkg_a')]);
    const fm: FeatureMatrix = {
      categories: [],
      features: [],
      mappings: [],
    };

    const result = enrichFeatureMatrixWithComponents(fm, model);

    expect(result.mappings).toEqual([]);
  });

  it('container に配下 component がない場合は元のマッピングのみ', () => {
    const model = makeModel([container('pkg_a')]);
    const fm: FeatureMatrix = {
      categories: [{ id: 'cat1', name: 'Cat1' }],
      features: [{ id: 'f1', name: 'Feature1', categoryId: 'cat1' }],
      mappings: [{ featureId: 'f1', elementId: 'pkg_a', role: 'primary' }],
    };

    const result = enrichFeatureMatrixWithComponents(fm, model);

    expect(result.mappings).toEqual([{ featureId: 'f1', elementId: 'pkg_a', role: 'primary' }]);
  });

  it('モデルに存在しない elementId のマッピングはそのまま保持する', () => {
    const model = makeModel([container('pkg_a')]);
    const fm: FeatureMatrix = {
      categories: [{ id: 'cat1', name: 'Cat1' }],
      features: [{ id: 'f1', name: 'Feature1', categoryId: 'cat1' }],
      mappings: [{ featureId: 'f1', elementId: 'pkg_nonexistent', role: 'primary' }],
    };

    const result = enrichFeatureMatrixWithComponents(fm, model);

    expect(result.mappings).toEqual(fm.mappings);
  });

  it('categories と features は変更されない', () => {
    const model = makeModel([container('pkg_a'), component('pkg_a/hooks', 'pkg_a')]);
    const fm: FeatureMatrix = {
      categories: [{ id: 'cat1', name: 'Cat1' }],
      features: [{ id: 'f1', name: 'Feature1', categoryId: 'cat1' }],
      mappings: [{ featureId: 'f1', elementId: 'pkg_a', role: 'primary' }],
    };

    const result = enrichFeatureMatrixWithComponents(fm, model);

    expect(result.categories).toBe(fm.categories);
    expect(result.features).toBe(fm.features);
  });
});
