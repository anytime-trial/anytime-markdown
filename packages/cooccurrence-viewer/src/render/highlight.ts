import type { RenderGraph, RenderTimeLink } from '../types';

export interface HighlightSelection {
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

/**
 * レイヤー間の点線を明るく残すか。両端のレイヤーがともに点灯しているときだけ明るくする。
 * 片端だけで残すと、線の無いレイヤー側へ視線が誘導され、点灯をレイヤー単位に絞った意味が
 * 点線経由で失われる（レイヤー単位ハイライト要件書 §2.3）。
 */
export function timeLinkLit(
  highlight: HighlightSelection | null,
  timeLink: Pick<RenderTimeLink, 'nodeIndex' | 'fromLayer' | 'toLayer'>,
): boolean {
  return (
    isNodeLit(highlight, timeLink.nodeIndex, timeLink.fromLayer) &&
    isNodeLit(highlight, timeLink.nodeIndex, timeLink.toLayer)
  );
}

export function computeNeighborhoodHighlight(graph: RenderGraph, selectedNodeIndex: number | null): HighlightSelection | null {
  if (selectedNodeIndex === null) return null;
  const links = new Set<number>();
  const keys = new Set<string>();
  for (const link of graph.links) {
    if (link.source !== selectedNodeIndex && link.target !== selectedNodeIndex) continue;
    links.add(link.index);
    // 近傍の点灯は線のあるレイヤーに限る。添字だけで点灯させると、線の無いレイヤーでも
    // 相手が明るく残り、「線が結ばれていないのに近傍に見える」誤読を生む。
    keys.add(nodeLayerKey(link.source === selectedNodeIndex ? link.target : link.source, link.layer));
  }
  for (const node of graph.nodes) {
    if (node.index === selectedNodeIndex) keys.add(nodeLayerKey(node.index, node.layer));
  }
  return { nodeLayerKeys: keys, linkIndexes: links };
}
