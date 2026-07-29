import type { RenderLink, RenderNode } from '../types';

/**
 * レイヤーごとの語の索引。
 *
 * レイヤー表示では同じ `index` の語がレイヤーの数だけ現れるため、`index` だけを鍵にした
 * 索引は最後に書き込んだレイヤーの語で上書きされる。共起はそのとき、別のレイヤーの語の座標へ
 * 引かれる（図をまたいで線が走る）。図は描けてしまうため、この誤りは見た目でしか気づけない。
 */
export type NodeLookup = ReadonlyArray<ReadonlyMap<number, RenderNode>>;

export function buildNodeLookup(nodes: readonly RenderNode[]): NodeLookup {
  const layers: Map<number, RenderNode>[] = [];
  for (const node of nodes) {
    while (layers.length <= node.layer) layers.push(new Map());
    layers[node.layer].set(node.index, node);
  }
  return layers;
}

/** 共起の両端の語。同じレイヤーの中だけを探す。 */
export function linkEndpoints(
  lookup: NodeLookup,
  link: RenderLink,
): { source: RenderNode; target: RenderNode } | null {
  const layer = lookup[link.layer];
  if (layer === undefined) return null;
  const source = layer.get(link.source);
  const target = layer.get(link.target);
  return source !== undefined && target !== undefined ? { source, target } : null;
}
