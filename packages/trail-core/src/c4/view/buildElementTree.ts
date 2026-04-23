import type { BoundaryInfo, C4Element, C4ElementType, C4Model, C4TreeNode } from '../types';

/**
 * C4Modelのフラットな要素リストとBoundaryInfoから
 * ツリー表示用の階層構造を構築する。
 *
 * - 要素のboundaryIdで親子関係を決定
 * - BoundaryInfoに対応する要素がない場合はtype:'boundary'の仮想ノードを生成
 */
export function buildElementTree(
  model: C4Model,
  boundaries: readonly BoundaryInfo[],
): C4TreeNode[] {
  const { elements } = model;
  if (elements.length === 0) return [];

  // 要素IDマップ
  const elementById = new Map<string, C4Element>();
  for (const el of elements) {
    elementById.set(el.id, el);
  }

  // boundaryIdごとに子要素をグルーピング
  const childrenByParent = new Map<string | undefined, C4Element[]>();
  for (const el of elements) {
    const parentId = el.boundaryId;
    const list = childrenByParent.get(parentId);
    if (list) {
      list.push(el);
    } else {
      childrenByParent.set(parentId, [el]);
    }
  }

  // BoundaryInfoのうち要素として存在しないIDを収集
  const boundaryOnlyIds = new Set<string>();
  for (const b of boundaries) {
    if (!elementById.has(b.id) && childrenByParent.has(b.id)) {
      boundaryOnlyIds.add(b.id);
    }
  }
  const boundaryInfoMap = new Map<string, BoundaryInfo>();
  for (const b of boundaries) {
    boundaryInfoMap.set(b.id, b);
  }

  function sortByName<T extends { name: string }>(list: T[]): T[] {
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function buildNode(el: C4Element): C4TreeNode {
    const kids = childrenByParent.get(el.id);
    const children = kids ? sortByName(kids).map(buildNode) : [];
    return {
      id: el.id,
      name: el.name,
      type: el.type,
      ...(el.external ? { external: true } : {}),
      ...(el.technology ? { technology: el.technology } : {}),
      ...(el.description ? { description: el.description } : {}),
      ...(el.deleted ? { deleted: true } : {}),
      ...(el.serviceType ? { serviceType: el.serviceType } : {}),
      children,
    };
  }

  function buildBoundaryNode(id: string): C4TreeNode {
    const info = boundaryInfoMap.get(id);
    const kids = childrenByParent.get(id);
    const children: C4TreeNode[] = [];
    if (kids) {
      for (const el of sortByName(kids)) {
        children.push(buildNode(el));
      }
    }
    return {
      id,
      name: info?.name ?? id,
      type: 'boundary',
      children,
    };
  }

  // ルート要素: boundaryIdがない要素 + boundary-onlyノード
  const roots: C4TreeNode[] = [];

  // boundaryIdがない要素
  const rootElements = childrenByParent.get(undefined) ?? [];
  for (const el of sortByName(rootElements)) {
    if (boundaryOnlyIds.has(el.id)) continue; // boundary-onlyとして別途処理
    roots.push(buildNode(el));
  }

  // boundary-only仮想ノード（ルートレベルのもの）
  const boundaryOnlyRoots: C4TreeNode[] = [];
  for (const id of boundaryOnlyIds) {
    // このboundary自体がどこかの子でないか確認
    const hasParent = elements.some(el => el.id === id && el.boundaryId);
    if (!hasParent) {
      boundaryOnlyRoots.push(buildBoundaryNode(id));
    }
  }
  for (const node of sortByName(boundaryOnlyRoots)) {
    roots.push(node);
  }

  return sortByName(roots);
}

/**
 * レベルごとに表示する要素タイプ。
 * L1: person, system のみ
 * L2: + container, containerDb
 * L3: + component
 * L4: + code（全て）
 */
const VISIBLE_TYPES_BY_LEVEL: Readonly<Record<number, ReadonlySet<C4ElementType>>> = {
  1: new Set<C4ElementType>(['person', 'system']),
  2: new Set<C4ElementType>(['person', 'system', 'container', 'containerDb']),
  3: new Set<C4ElementType>(['person', 'system', 'container', 'containerDb', 'component']),
  4: new Set<C4ElementType>(['person', 'system', 'container', 'containerDb', 'component', 'code']),
};

/**
 * C4ツリーをレベルに応じてフィルタリングする。
 * boundaryノードは常に残り、子要素のみフィルタされる。
 */
export function filterTreeByLevel(
  tree: readonly C4TreeNode[],
  level: number,
): C4TreeNode[] {
  if (level >= 4) return tree.map(n => ({ ...n }));

  const visibleTypes = VISIBLE_TYPES_BY_LEVEL[level] ?? VISIBLE_TYPES_BY_LEVEL[4];

  function filterNode(node: C4TreeNode): C4TreeNode | null {
    if (node.type !== 'boundary' && !visibleTypes.has(node.type)) {
      return null;
    }
    const children = node.children
      .map(filterNode)
      .filter((n): n is C4TreeNode => n !== null);
    return { ...node, children };
  }

  return tree
    .map(filterNode)
    .filter((n): n is C4TreeNode => n !== null);
}
