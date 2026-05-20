import type { C4Model, C4Element, C4TreeNode } from '../types';
import type { CommunitySummary } from '../../codeGraph';
import type { CommunityOverlayEntry } from '../computeCommunityOverlay';

export interface CommunityTreeInput {
  readonly c4Model: C4Model;
  readonly communityOverlay: ReadonlyMap<string, CommunityOverlayEntry>;
  readonly communities: Record<number, string>;
  readonly communitySummaries?: Record<number, CommunitySummary>;
  readonly maxDepth?: 'container' | 'component' | 'code';
}

/** オーバーレイエントリをコミュニティ番号でグループ化する */
function groupElementsByCommunity(
  communityOverlay: ReadonlyMap<string, CommunityOverlayEntry>,
): Map<number, string[]> {
  const result = new Map<number, string[]>();
  for (const [elementId, entry] of communityOverlay) {
    const cid = entry.dominantCommunity;
    const list = result.get(cid);
    if (list) list.push(elementId);
    else result.set(cid, [elementId]);
  }
  return result;
}

/** code 型の子ノードを名前昇順で返す */
function buildCodeChildNodes(
  compId: string,
  elements: C4Model['elements'],
): C4TreeNode[] {
  return elements
    .filter(el => el.boundaryId === compId && el.type === 'code')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(el => ({
      id: el.id,
      name: el.name,
      type: el.type as C4TreeNode['type'],
      children: [] as C4TreeNode[],
    }));
}

/** 1つのコンポーネント要素をツリーノードに変換する */
function buildComponentNode(
  compEl: C4Element,
  elements: C4Model['elements'],
  maxDepth: 'container' | 'component' | 'code',
): C4TreeNode {
  const codeChildren = maxDepth === 'code' ? buildCodeChildNodes(compEl.id, elements) : [];
  return {
    id: compEl.id,
    name: compEl.name,
    type: compEl.type,
    ...(compEl.description ? { description: compEl.description } : {}),
    children: codeChildren,
  };
}

/** コンポーネント ID 列をコンテナ別にグループ化する */
function groupComponentsByContainer(
  compIds: string[],
  elementById: Map<string, C4Element>,
): Map<string | undefined, string[]> {
  const result = new Map<string | undefined, string[]>();
  for (const compId of compIds) {
    const parentId = elementById.get(compId)?.boundaryId;
    const list = result.get(parentId);
    if (list) list.push(compId);
    else result.set(parentId, [compId]);
  }
  return result;
}

/** 1つのコンテナグループをコンテナノード（または展開したコンポーネント列）に変換する */
function buildContainerNode(
  containerId: string | undefined,
  compIds: string[],
  elementById: Map<string, C4Element>,
  elements: C4Model['elements'],
  maxDepth: 'container' | 'component' | 'code',
): C4TreeNode[] {
  const componentNodes: C4TreeNode[] =
    maxDepth === 'container'
      ? []
      : compIds
          .flatMap(compId => {
            const compEl = elementById.get(compId);
            if (!compEl) return [];
            return [buildComponentNode(compEl, elements, maxDepth)];
          })
          .sort((a, b) => a.name.localeCompare(b.name));

  const containerEl = containerId ? elementById.get(containerId) : undefined;
  if (!containerEl) return componentNodes;

  return [
    {
      id: containerEl.id,
      name: containerEl.name,
      type: containerEl.type,
      ...(containerEl.technology ? { technology: containerEl.technology } : {}),
      ...(containerEl.serviceType ? { serviceType: containerEl.serviceType } : {}),
      children: componentNodes,
    },
  ];
}

export function buildCommunityTree(input: CommunityTreeInput): C4TreeNode[] {
  const { c4Model, communityOverlay, communities, communitySummaries, maxDepth = 'code' } = input;
  const elements = c4Model.elements;
  const elementById = new Map(elements.map(el => [el.id, el]));

  const componentsByCommunity = groupElementsByCommunity(communityOverlay);
  if (componentsByCommunity.size === 0) return [];

  const sortedCommunityIds = [...componentsByCommunity.keys()].sort((a, b) => a - b);

  return sortedCommunityIds.map(cid => {
    const componentIds = componentsByCommunity.get(cid)!;
    const summary = communitySummaries?.[cid];
    const communityName = summary?.name ?? communities[cid] ?? `#${cid}`;

    const componentsByContainer = groupComponentsByContainer(componentIds, elementById);

    const containerNodes: C4TreeNode[] = [];
    for (const [containerId, compIds] of componentsByContainer) {
      containerNodes.push(...buildContainerNode(containerId, compIds, elementById, elements, maxDepth));
    }
    containerNodes.sort((a, b) => a.name.localeCompare(b.name));

    return {
      id: `community:${cid}`,
      name: communityName,
      type: 'community' as const,
      communityId: cid,
      nodeCount: componentIds.length,
      ...(summary?.summary ? { description: summary.summary } : {}),
      children: containerNodes,
    };
  });
}
