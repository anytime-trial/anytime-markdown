// domain/engine/c4Mapper.ts — Map file paths to C4 model elements and features

export interface C4Element {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly boundaryId?: string;
}

export interface C4MappingResult {
  readonly elementId: string;
  readonly elementType: string;
  readonly elementName: string;
  readonly matchType: 'exact' | 'package_fallback';
}

export function buildC4ElementById(
  elements: readonly C4Element[],
): ReadonlyMap<string, C4Element> {
  const map = new Map<string, C4Element>();
  for (const el of elements) {
    map.set(el.id, el);
  }
  return map;
}

/**
 * 単一ファイルパスを C4 要素にマップする。呼び出し側がループする場合は
 * `buildC4ElementById` で構築済みの Map を渡すことで O(N×M) を避けられる。
 *
 * Strategy 1: `file::` + filePath で完全一致
 * Strategy 2: `packages/xxx/` -> `pkg_xxx` のパッケージフォールバック
 */
export function mapFileToC4Elements(
  filePath: string,
  elementById: ReadonlyMap<string, C4Element>,
): C4MappingResult[] {
  // tool_calls の input.file_path は Claude Code が絶対パス
  // (`/anytime-markdown/packages/...`) で記録するため、`packages/`
  // 出現位置以降に正規化して相対化する。Strategy 1 の `file::` 完全一致と
  // Strategy 2 の `^packages/` fallback の両方で必要。
  const pkgIdx = filePath.indexOf('packages/');
  const normalizedPath = pkgIdx > 0 ? filePath.slice(pkgIdx) : filePath;

  const results: C4MappingResult[] = [];
  const seen = new Set<string>();

  // 1. Exact file match
  const fileId = `file::${normalizedPath}`;
  const fileEl = elementById.get(fileId);
  if (fileEl) {
    results.push({
      elementId: fileEl.id,
      elementType: fileEl.type,
      elementName: fileEl.name,
      matchType: 'exact',
    });
    seen.add(fileEl.id);

    // Also add parent container/component via boundaryId chain
    let current = fileEl;
    while (current.boundaryId) {
      const parent = elementById.get(current.boundaryId);
      if (!parent || seen.has(parent.id)) break;
      results.push({
        elementId: parent.id,
        elementType: parent.type,
        elementName: parent.name,
        matchType: 'exact',
      });
      seen.add(parent.id);
      current = parent;
    }
    return results;
  }

  // 2. Package fallback: packages/xxx/ -> pkg_xxx
  const pkgMatch = /^packages\/([^/]+)\//.exec(normalizedPath);
  if (pkgMatch) {
    const pkgId = `pkg_${pkgMatch[1]}`;
    const pkgEl = elementById.get(pkgId);
    if (pkgEl) {
      results.push({
        elementId: pkgId,
        elementType: pkgEl.type,
        elementName: pkgEl.name,
        matchType: 'package_fallback',
      });
    }
  }

  return results;
}

/**
 * Map changed file paths to C4 model elements.
 *
 * 戻り値は要素 ID で重複排除される（複数ファイルが同じ要素にマップされた場合は最初の一つのみ）。
 */
export function mapFilesToC4Elements(
  filePaths: readonly string[],
  elements: readonly C4Element[],
): C4MappingResult[] {
  const elementById = buildC4ElementById(elements);
  const results: C4MappingResult[] = [];
  const seen = new Set<string>();

  for (const filePath of filePaths) {
    for (const m of mapFileToC4Elements(filePath, elementById)) {
      if (seen.has(m.elementId)) continue;
      seen.add(m.elementId);
      results.push(m);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
//  Feature mapping
// ---------------------------------------------------------------------------

export interface Feature {
  readonly id: string;
  readonly name: string;
}

export interface FeatureMapping {
  readonly featureId: string;
  readonly elementId: string;
  readonly role: string;
}

export interface FeatureMappingResult {
  readonly featureId: string;
  readonly featureName: string;
  readonly role: string;
}

/**
 * Map affected C4 element IDs to features via featureMatrix mappings.
 */
export function mapC4ToFeatures(
  c4ElementIds: readonly string[],
  features: readonly Feature[],
  mappings: readonly FeatureMapping[],
): FeatureMappingResult[] {
  const elementIdSet = new Set(c4ElementIds);
  const featureById = new Map<string, Feature>();
  for (const f of features) {
    featureById.set(f.id, f);
  }

  const seen = new Set<string>();
  const results: FeatureMappingResult[] = [];

  for (const mapping of mappings) {
    if (!elementIdSet.has(mapping.elementId)) continue;
    if (seen.has(mapping.featureId)) continue;
    seen.add(mapping.featureId);

    const feature = featureById.get(mapping.featureId);
    if (!feature) continue;

    results.push({
      featureId: mapping.featureId,
      featureName: feature.name,
      role: mapping.role,
    });
  }

  return results;
}

/** Data structure for feature mapping configuration */
export interface FeatureData {
  readonly features: readonly Feature[];
  readonly mappings: readonly FeatureMapping[];
}
