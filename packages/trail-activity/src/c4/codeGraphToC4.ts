import type { CodeGraphNode, StoredCodeGraph } from '../codeGraph';
import type { C4Model, C4Element, C4Relationship } from './types';

/**
 * `current_code_graphs.graph_json` の {@link StoredCodeGraph} 形式から
 * C4 派生モデルを計算する。
 *
 * - `repositories[i]` → System (`sys_<repo.id>`)
 * - `nodes[].package` → Container (`pkg_<package>`)
 *   `boundaryId` は当該 package の最初に現れた node の `repo`
 * - `nodes[].community` → Component (`community_<n>`)
 *   `boundaryId` は同コミュニティ内で最頻の package
 * - `nodes[]` → Code element (id は `node.id` をそのまま使用)
 *   `boundaryId` は当該ノードの `community_<n>`
 * - `edges` を file / component / container の 3 階層に重複排除して集約
 *
 * 旧 {@link import('../transform/toC4').trailToC4} との違い:
 *
 * - 入力が `TrailGraph` (`metadata.projectRoot` ベース) ではなく
 *   `StoredCodeGraph` (`repositories` + `node.package` / `node.community` ベース)
 * - Component 単位はディレクトリ名ではなくコミュニティ ID
 * - `pkg_<package>` 命名規則は維持（`c4_manual_*` の参照との互換性確保）
 */

/** Phase 1: repositories → System 要素 */
function buildSystemElements(graph: StoredCodeGraph): C4Element[] {
  return graph.repositories.map((repo) => ({
    id: `sys_${repo.id}`,
    type: 'system' as const,
    name: repo.label,
  }));
}

/** Phase 2: package → repo マップと Container 要素を構築する。 */
function buildContainerElements(graph: StoredCodeGraph): {
  packageToRepo: Map<string, string>;
  elements: C4Element[];
} {
  const packageToRepo = new Map<string, string>();
  const packageOrder: string[] = [];
  for (const node of graph.nodes) {
    if (!node.package) continue;
    if (!packageToRepo.has(node.package)) {
      packageToRepo.set(node.package, node.repo);
      packageOrder.push(node.package);
    }
  }
  const elements: C4Element[] = packageOrder.map((pkg) => {
    const repo = packageToRepo.get(pkg) ?? '';
    return {
      id: `pkg_${pkg}`,
      type: 'container' as const,
      name: pkg,
      ...(repo ? { boundaryId: `sys_${repo}` } : {}),
    };
  });
  return { packageToRepo, elements };
}

type CommunityState = {
  label: string;
  pkgCount: Map<string, number>;
};

/** community ごとの state（ラベル + package 出現回数）を集計する。 */
function buildCommunityState(graph: StoredCodeGraph): {
  communityState: Map<number, CommunityState>;
  communityOrder: number[];
} {
  const communityState = new Map<number, CommunityState>();
  const communityOrder: number[] = [];
  for (const node of graph.nodes) {
    let st = communityState.get(node.community);
    if (!st) {
      st = { label: node.communityLabel ?? '', pkgCount: new Map() };
      communityState.set(node.community, st);
      communityOrder.push(node.community);
    }
    if (node.package) {
      st.pkgCount.set(node.package, (st.pkgCount.get(node.package) ?? 0) + 1);
    }
    if (!st.label && node.communityLabel) st.label = node.communityLabel;
  }
  return { communityState, communityOrder };
}

/** community → 最頻 package を解決する。 */
function resolveMostFrequentPackage(pkgCount: Map<string, number>): string {
  let mostFreq = '';
  let maxCount = 0;
  for (const [pkg, count] of pkgCount) {
    if (count > maxCount) {
      maxCount = count;
      mostFreq = pkg;
    }
  }
  return mostFreq;
}

/** Phase 3: community → Component 要素 + community→pkg マップを構築する。 */
function buildComponentElements(
  communityState: Map<number, CommunityState>,
  communityOrder: number[],
): { communityToPkg: Map<number, string>; elements: C4Element[] } {
  const communityToPkg = new Map<number, string>();
  const elements: C4Element[] = [];
  for (const community of communityOrder) {
    const st = communityState.get(community);
    if (!st) continue;
    const mostFreq = resolveMostFrequentPackage(st.pkgCount);
    communityToPkg.set(community, mostFreq);
    elements.push({
      id: `community_${community}`,
      type: 'component',
      name: st.label || `community-${community}`,
      ...(mostFreq ? { boundaryId: `pkg_${mostFreq}` } : {}),
    });
  }
  return { communityToPkg, elements };
}

/** Phase 4: nodes → Code 要素 */
function buildCodeElements(graph: StoredCodeGraph): C4Element[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: 'code' as const,
    name: node.label,
    boundaryId: `community_${node.community}`,
  }));
}

/** 重複排除しながら relationship を追加するヘルパー。 */
function addRelIfNew(
  seen: Set<string>,
  key: string,
  from: string,
  to: string,
  relationships: C4Relationship[],
): void {
  if (seen.has(key)) return;
  seen.add(key);
  relationships.push({ from, to, label: 'imports' });
}

/** Phase 5: edges → 3 階層 Relationships（重複排除済み） */
function buildRelationships(graph: StoredCodeGraph): C4Relationship[] {
  const nodeById = new Map<string, CodeGraphNode>();
  for (const node of graph.nodes) nodeById.set(node.id, node);

  const relationships: C4Relationship[] = [];
  const fileSeen = new Set<string>();
  const componentSeen = new Set<string>();
  const containerSeen = new Set<string>();

  for (const edge of graph.edges) {
    const src = nodeById.get(edge.source);
    const dst = nodeById.get(edge.target);
    if (!src || !dst) continue;

    // file 層
    addRelIfNew(fileSeen, `${edge.source}→${edge.target}`, edge.source, edge.target, relationships);

    // component 層 (異 community のみ)
    if (src.community !== dst.community) {
      addRelIfNew(
        componentSeen,
        `${src.community}→${dst.community}`,
        `community_${src.community}`,
        `community_${dst.community}`,
        relationships,
      );
    }

    // container 層 (異 package のみ)
    if (src.package && dst.package && src.package !== dst.package) {
      addRelIfNew(
        containerSeen,
        `${src.package}→${dst.package}`,
        `pkg_${src.package}`,
        `pkg_${dst.package}`,
        relationships,
      );
    }
  }
  return relationships;
}

export function codeGraphToC4(graph: StoredCodeGraph): C4Model {
  // 異常入力（リポジトリ 0 件）でも例外を投げず空モデルを返す
  if (graph.repositories.length === 0 && graph.nodes.length === 0) {
    return { title: 'Project Analysis', level: 'code', elements: [], relationships: [] };
  }

  const systemElements = buildSystemElements(graph);
  const { elements: containerElements } = buildContainerElements(graph);
  const { communityState, communityOrder } = buildCommunityState(graph);
  const { elements: componentElements } = buildComponentElements(communityState, communityOrder);
  const codeElements = buildCodeElements(graph);
  const relationships = buildRelationships(graph);

  const elements: C4Element[] = [
    ...systemElements,
    ...containerElements,
    ...componentElements,
    ...codeElements,
  ];

  return {
    title: 'Project Analysis',
    level: 'code',
    elements,
    relationships,
  };
}
