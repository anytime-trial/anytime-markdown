import type { Feature, FeatureCategory, FeatureMapping, FeatureMatrix, FeatureRole } from './types';

export interface CommunityRow {
  readonly community_id: number;
  readonly name: string;
  readonly label: string;
  readonly mappings_json: string | null;
}

interface RawMapping {
  readonly elementId: string;
  readonly elementType: string;
  readonly role: FeatureRole;
}

const LABEL_TO_CATEGORY: Record<string, string> = {
  engine: 'cat_core', trail: 'cat_core', c4: 'cat_core', domain: 'cat_core', importance: 'cat_core',
  components: 'cat_ui', hooks: 'cat_ui', utils: 'cat_ui', plugins: 'cat_ui',
  'spreadsheet-core': 'cat_ui', i18n: 'cat_ui', app: 'cat_ui',
  'cms-core': 'cat_infra', tools: 'cat_infra', providers: 'cat_infra', 'mcp-trail': 'cat_infra',
};

const CATEGORIES: readonly FeatureCategory[] = [
  { id: 'cat_core', name: 'コア基盤' },
  { id: 'cat_ui', name: 'UI / アプリ' },
  { id: 'cat_infra', name: 'インフラ / 外部連携' },
];

/**
 * `current_code_graph_communities` の各行 (mappings_json 込み) から FeatureMatrix を構築する。
 * - name が空、または mappings_json が null/空/不正 JSON の行は除外
 * - 残行ゼロなら null を返す
 */
export function buildFeatureMatrixFromCommunities(
  rows: ReadonlyArray<CommunityRow>,
): FeatureMatrix | null {
  const features: Feature[] = [];
  const mappings: FeatureMapping[] = [];

  for (const row of rows) {
    if (!row.name || !row.mappings_json) continue;
    let parsed: RawMapping[];
    try {
      parsed = JSON.parse(row.mappings_json) as RawMapping[];
    } catch {
      continue;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) continue;

    const featureId = `f_community_${row.community_id}`;
    const categoryId = LABEL_TO_CATEGORY[row.label] ?? 'cat_infra';
    features.push({ id: featureId, name: row.name, categoryId });
    for (const m of parsed) {
      mappings.push({ featureId, elementId: m.elementId, role: m.role });
    }
  }

  if (features.length === 0) return null;
  return { categories: CATEGORIES, features, mappings };
}
