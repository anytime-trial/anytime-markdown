import type { C4Element } from '@anytime-markdown/trail-core/c4';
import { extractComponentName } from '@anytime-markdown/trail-core/transform';
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import seedrandom from 'seedrandom';

// Louvain の rng を seedrandom で固定して決定論化する。
// シード未固定だと同一入力でも community_id 採番順が変動し、
// current_code_graph_communities.mappings_json が再解析のたびに失われる事故が起きる。
// `v1` サフィックスは将来意図的にクラスタリング結果を変えたい時の踏み台。
const LOUVAIN_SEED = 'anytime-trail:louvain:v1';

export interface ClusterResult {
  /** nodeId → communityId */
  readonly communities: Record<string, number>;
  /** communityId → ラベル文字列 */
  readonly labels: Record<number, string>;
}

export class GraphClusterer {
  cluster(graph: Graph, c4Elements?: readonly C4Element[]): ClusterResult {
    if (graph.order === 0) return { communities: {}, labels: {} };

    // louvain は mixed graph（有向・無向エッジ混在）を拒否するため、
    // クラスタリング用に無向グラフへ変換する。
    const undirected = new Graph({ type: 'undirected' });
    graph.forEachNode((node, attrs) => {
      undirected.addNode(node, attrs);
    });
    graph.forEachEdge((_edge, attrs, source, target) => {
      if (!undirected.hasEdge(source, target)) {
        undirected.addEdge(source, target, attrs);
      }
    });

    const communities = louvain(undirected, {
      rng: seedrandom(LOUVAIN_SEED),
    }) as Record<string, number>;
    const labels = buildCommunityLabels(graph, communities, c4Elements);
    return { communities, labels };
  }
}

/**
 * クラスタごとに代表ラベルを決定する。
 * c4Elements が供給されている場合は C4 component → container → package の順に解決し、
 * 各コミュニティ内で最頻名（同票時はアルファベット順最小）を採用する。
 */
export function buildCommunityLabels(
  graph: Graph,
  communities: Record<string, number>,
  c4Elements?: readonly C4Element[],
): Record<number, string> {
  const elementById = new Map<string, C4Element>();
  for (const el of c4Elements ?? []) {
    elementById.set(el.id, el);
  }

  const votes: Record<number, Map<string, number>> = {};
  graph.forEachNode((node) => {
    const cid = communities[node];
    if (cid === undefined) return;
    const pkg = (graph.getNodeAttribute(node, 'package') as string) || 'unknown';
    const name = resolveDisplayName(node, pkg, elementById);
    const bucket = (votes[cid] ??= new Map<string, number>());
    bucket.set(name, (bucket.get(name) ?? 0) + 1);
  });

  const labels: Record<number, string> = {};
  for (const [cidStr, bucket] of Object.entries(votes)) {
    labels[Number(cidStr)] = pickTopName(bucket);
  }
  return labels;
}

function resolveDisplayName(
  nodeId: string,
  pkg: string,
  elementById: ReadonlyMap<string, C4Element>,
): string {
  if (elementById.size === 0) return pkg;

  const component = extractComponentSegment(nodeId);
  if (component) {
    const compEl = elementById.get(`pkg_${pkg}/${component}`);
    if (compEl) return compEl.name;
  }

  const containerEl = elementById.get(`pkg_${pkg}`);
  if (containerEl) return containerEl.name;

  return pkg;
}

/**
 * ノード ID（`${repo}:${relativePath}` 形式）から component セグメントを取り出す。
 * trail-core/transform/toC4.ts の extractComponentName と regex を共有する。
 *
 * GraphClusterer は top-level "packages" も component とみなさない (community label の品質
 * 維持のため) ため、共通関数の戻り値を post-filter する。
 */
function extractComponentSegment(nodeId: string): string | undefined {
  const colon = nodeId.indexOf(':');
  const relPath = colon >= 0 ? nodeId.slice(colon + 1) : nodeId;
  const result = extractComponentName(relPath);
  return result === 'packages' ? undefined : result;
}

function pickTopName(bucket: ReadonlyMap<string, number>): string {
  let best: { name: string; count: number } | undefined;
  for (const [name, count] of bucket) {
    if (
      !best ||
      count > best.count ||
      (count === best.count && name < best.name)
    ) {
      best = { name, count };
    }
  }
  return best?.name ?? 'unknown';
}
