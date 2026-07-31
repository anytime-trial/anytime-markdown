import type { RenderGraph } from '../types';

export interface HighlightSelection {
  /** 添字単位の近傍集合。レイヤーを持たない消費者（3D の柱・ラベル昇格）が使う。 */
  nodeIndexes: ReadonlySet<number>;
  /**
   * （添字, レイヤー）単位の点灯集合。選択語は存在する全レイヤー、近傍語は選択語との共起の
   * 線が描かれているレイヤーだけを含む（レイヤー単位ハイライト要件書 §2.1〜2.2)。
   */
  nodeLayerKeys: ReadonlySet<string>;
  linkIndexes: ReadonlySet<number>;
}

export function nodeLayerKey(index: number, layer: number): string {
  return `${index}:${layer}`;
}

/** そのレイヤー上の語を明るく残すか。選択なし（highlight が null）は全点灯。 */
export function isNodeLit(highlight: HighlightSelection | null, index: number, layer: number): boolean {
  return highlight === null || highlight.nodeLayerKeys.has(nodeLayerKey(index, layer));
}

export function computeNeighborhoodHighlight(graph: RenderGraph, selectedNodeIndex: number | null): HighlightSelection | null {
  if (selectedNodeIndex === null) return null;
  const nodes = new Set<number>([selectedNodeIndex]);
  const links = new Set<number>();
  const keys = new Set<string>();
  for (const link of graph.links) {
    if (link.source !== selectedNodeIndex && link.target !== selectedNodeIndex) continue;
    links.add(link.index);
    nodes.add(link.source);
    nodes.add(link.target);
    // 近傍の点灯は線のあるレイヤーに限る。添字だけで点灯させると、線の無いレイヤーでも
    // 相手が明るく残り、「線が結ばれていないのに近傍に見える」誤読を生む。
    keys.add(nodeLayerKey(link.source === selectedNodeIndex ? link.target : link.source, link.layer));
  }
  for (const node of graph.nodes) {
    if (node.index === selectedNodeIndex) keys.add(nodeLayerKey(node.index, node.layer));
  }
  return { nodeIndexes: nodes, nodeLayerKeys: keys, linkIndexes: links };
}
