import type { HierarchyTreeItem } from './buildHierarchyTreeData';

export interface FlatRow {
  readonly item: HierarchyTreeItem;
  readonly level: number;
  /** その row の直下に子があるか (cycle / revisited は children=[] でも展開不可なので別途 item.cycle/revisited で判断) */
  readonly hasChildren: boolean;
}

/**
 * ツリーを「展開済みノードのフラットリスト」に変換する純粋関数。
 * - expanded セットに含まれるノードは子も追加
 * - cycle / revisited のノードは展開不可なので子は無視 (本来 children=[] のはず)
 */
export function flattenTree(
  root: HierarchyTreeItem,
  expanded: ReadonlySet<string>,
): FlatRow[] {
  const result: FlatRow[] = [];

  const visit = (node: HierarchyTreeItem, level: number): void => {
    const isExpandable = !node.cycle && !node.revisited;
    result.push({ item: node, level, hasChildren: isExpandable && node.children.length > 0 });
    if (!isExpandable) return;
    if (!expanded.has(node.id)) return;
    for (const child of node.children) {
      visit(child, level + 1);
    }
  };
  visit(root, 0);
  return result;
}
