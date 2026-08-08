import type { C4TreeNode } from '../types';

export function filterTreeBySearch(
  tree: readonly C4TreeNode[],
  query: string,
): readonly C4TreeNode[] {
  if (!query.trim()) return tree;
  return tree.flatMap(node => filterNode(node, query) ?? []);
}

function filterNode(node: C4TreeNode, query: string): C4TreeNode | null {
  const filteredChildren = node.children.flatMap(c => filterNode(c, query) ?? []);
  const selfMatch = node.name.toLowerCase().includes(query.toLowerCase());
  if (!selfMatch && filteredChildren.length === 0) return null;
  return { ...node, children: filteredChildren };
}
