import { buildFeatureMatrixFromCommunities, type CommunityRow } from '../buildFeatureMatrixFromCommunities';

describe('buildFeatureMatrixFromCommunities', () => {
  it('returns null for empty input', () => {
    expect(buildFeatureMatrixFromCommunities([])).toBeNull();
  });

  it('returns null when all rows have no mappings_json', () => {
    const rows: CommunityRow[] = [
      { community_id: 1, name: 'foo', label: 'engine', mappings_json: null },
      { community_id: 2, name: 'bar', label: 'components', mappings_json: '' },
    ];
    expect(buildFeatureMatrixFromCommunities(rows)).toBeNull();
  });

  it('skips rows with empty name', () => {
    const rows: CommunityRow[] = [
      { community_id: 1, name: '', label: 'engine', mappings_json: '[{"elementId":"pkg_a","elementType":"container","role":"primary"}]' },
    ];
    expect(buildFeatureMatrixFromCommunities(rows)).toBeNull();
  });

  it('builds matrix with correct categories, features, mappings', () => {
    const rows: CommunityRow[] = [
      {
        community_id: 5,
        name: 'カバレッジ計算',
        label: 'engine',
        mappings_json: JSON.stringify([
          { elementId: 'pkg_trail-activity/coverage', elementType: 'component', role: 'primary' },
          { elementId: 'pkg_trail-viewer/hooks', elementType: 'component', role: 'dependency' },
        ]),
      },
    ];
    const result = buildFeatureMatrixFromCommunities(rows);
    expect(result).not.toBeNull();
    expect(result!.categories).toEqual([
      { id: 'cat_core', name: 'コア基盤' },
      { id: 'cat_ui', name: 'UI / アプリ' },
      { id: 'cat_infra', name: 'インフラ / 外部連携' },
    ]);
    expect(result!.features).toContainEqual({ id: 'f_community_5', name: 'カバレッジ計算', categoryId: 'cat_core' });
    expect(result!.mappings).toContainEqual({ featureId: 'f_community_5', elementId: 'pkg_trail-activity/coverage', role: 'primary' });
    expect(result!.mappings).toContainEqual({ featureId: 'f_community_5', elementId: 'pkg_trail-viewer/hooks', role: 'dependency' });
  });

  it('maps unknown labels to cat_infra', () => {
    const rows: CommunityRow[] = [
      {
        community_id: 9,
        name: '未知',
        label: 'unknown-label',
        mappings_json: JSON.stringify([{ elementId: 'pkg_x', elementType: 'container', role: 'primary' }]),
      },
    ];
    const result = buildFeatureMatrixFromCommunities(rows);
    expect(result!.features[0].categoryId).toBe('cat_infra');
  });

  it('skips rows where mappings_json is invalid JSON', () => {
    const rows: CommunityRow[] = [
      { community_id: 1, name: 'broken', label: 'engine', mappings_json: 'not-json' },
    ];
    expect(buildFeatureMatrixFromCommunities(rows)).toBeNull();
  });
});
