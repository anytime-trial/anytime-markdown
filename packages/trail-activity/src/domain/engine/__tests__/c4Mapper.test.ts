import {
  buildC4ElementById,
  mapFileToC4Elements,
  mapFilesToC4Elements,
  mapC4ToFeatures,
  type C4Element,
  type Feature,
  type FeatureMapping,
} from '../c4Mapper';

const EL_FILE: C4Element = { id: 'file::src/foo.ts', type: 'file', name: 'foo.ts' };
const EL_COMP: C4Element = { id: 'pkg_foo/comp', type: 'component', name: 'FooComp', boundaryId: undefined };
const EL_FILE_WITH_BOUNDARY: C4Element = {
  id: 'file::src/bar.ts',
  type: 'file',
  name: 'bar.ts',
  boundaryId: 'pkg_bar',
};
const EL_PKG: C4Element = { id: 'pkg_bar', type: 'container', name: 'BarPkg', boundaryId: 'sys_main' };
const EL_SYS: C4Element = { id: 'sys_main', type: 'system', name: 'Main' };

describe('buildC4ElementById', () => {
  test('empty list returns empty map', () => {
    expect(buildC4ElementById([]).size).toBe(0);
  });

  test('indexes elements by id', () => {
    const m = buildC4ElementById([EL_FILE, EL_COMP]);
    expect(m.get(EL_FILE.id)).toBe(EL_FILE);
    expect(m.get(EL_COMP.id)).toBe(EL_COMP);
    expect(m.size).toBe(2);
  });
});

describe('mapFileToC4Elements', () => {
  const byId = buildC4ElementById([EL_FILE, EL_COMP]);

  test('no match returns empty array', () => {
    expect(mapFileToC4Elements('src/unknown.ts', byId)).toEqual([]);
  });

  test('exact file match returns element with matchType exact', () => {
    const res = mapFileToC4Elements('src/foo.ts', byId);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ elementId: 'file::src/foo.ts', matchType: 'exact' });
  });

  test('package fallback when no exact file match', () => {
    const byId2 = buildC4ElementById([EL_COMP, { id: 'pkg_bar', type: 'container', name: 'Bar' }]);
    const res = mapFileToC4Elements('packages/bar/src/index.ts', byId2);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ elementId: 'pkg_bar', matchType: 'package_fallback' });
  });

  test('package path with no matching pkg element returns empty', () => {
    const byId2 = buildC4ElementById([EL_COMP]);
    const res = mapFileToC4Elements('packages/unknown/src/x.ts', byId2);
    expect(res).toEqual([]);
  });

  test('absolute path is normalized to package fallback', () => {
    const byId2 = buildC4ElementById([{ id: 'pkg_bar', type: 'container', name: 'Bar' }]);
    const res = mapFileToC4Elements('/anytime-markdown/packages/bar/src/index.ts', byId2);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ elementId: 'pkg_bar', matchType: 'package_fallback' });
  });

  test('exact match traverses boundaryId chain', () => {
    const byId2 = buildC4ElementById([EL_FILE_WITH_BOUNDARY, EL_PKG, EL_SYS]);
    const res = mapFileToC4Elements('src/bar.ts', byId2);
    expect(res).toHaveLength(3);
    expect(res[0]).toMatchObject({ elementId: 'file::src/bar.ts', matchType: 'exact' });
    expect(res[1]).toMatchObject({ elementId: 'pkg_bar', matchType: 'exact' });
    expect(res[2]).toMatchObject({ elementId: 'sys_main', matchType: 'exact' });
  });

  test('boundaryId chain stops at already-seen element (cycle guard)', () => {
    const cyclic: C4Element = { id: 'pkg_cycle', type: 'container', name: 'Cycle', boundaryId: 'pkg_cycle' };
    const fileEl: C4Element = { id: 'file::src/c.ts', type: 'file', name: 'c.ts', boundaryId: 'pkg_cycle' };
    const byId2 = buildC4ElementById([fileEl, cyclic]);
    const res = mapFileToC4Elements('src/c.ts', byId2);
    expect(res).toHaveLength(2);
  });
});

describe('mapFilesToC4Elements', () => {
  test('deduplicates results from multiple files mapping to same element', () => {
    const pkg: C4Element = { id: 'pkg_foo', type: 'container', name: 'Foo' };
    const elements = [pkg];
    const res = mapFilesToC4Elements(
      ['packages/foo/src/a.ts', 'packages/foo/src/b.ts'],
      elements,
    );
    expect(res).toHaveLength(1);
    expect(res[0].elementId).toBe('pkg_foo');
  });

  test('empty filePaths returns empty', () => {
    expect(mapFilesToC4Elements([], [EL_FILE])).toEqual([]);
  });

  test('empty elements returns empty', () => {
    expect(mapFilesToC4Elements(['src/foo.ts'], [])).toEqual([]);
  });
});

describe('mapC4ToFeatures', () => {
  const features: Feature[] = [
    { id: 'feat_a', name: 'Feature A' },
    { id: 'feat_b', name: 'Feature B' },
  ];
  const mappings: FeatureMapping[] = [
    { featureId: 'feat_a', elementId: 'pkg_foo', role: 'core' },
    { featureId: 'feat_b', elementId: 'pkg_bar', role: 'ui' },
    { featureId: 'feat_a', elementId: 'pkg_baz', role: 'util' },
  ];

  test('returns features matching given element ids', () => {
    const res = mapC4ToFeatures(['pkg_foo'], features, mappings);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ featureId: 'feat_a', featureName: 'Feature A', role: 'core' });
  });

  test('deduplicates features across multiple element ids', () => {
    const res = mapC4ToFeatures(['pkg_foo', 'pkg_baz'], features, mappings);
    expect(res).toHaveLength(1);
    expect(res[0].featureId).toBe('feat_a');
  });

  test('returns empty when no element ids match', () => {
    expect(mapC4ToFeatures(['pkg_none'], features, mappings)).toEqual([]);
  });

  test('skips mapping if feature id not in features list', () => {
    const badMappings: FeatureMapping[] = [{ featureId: 'feat_missing', elementId: 'pkg_foo', role: 'x' }];
    expect(mapC4ToFeatures(['pkg_foo'], features, badMappings)).toEqual([]);
  });

  test('returns empty for empty inputs', () => {
    expect(mapC4ToFeatures([], features, mappings)).toEqual([]);
    expect(mapC4ToFeatures(['pkg_foo'], [], mappings)).toEqual([]);
    expect(mapC4ToFeatures(['pkg_foo'], features, [])).toEqual([]);
  });
});
