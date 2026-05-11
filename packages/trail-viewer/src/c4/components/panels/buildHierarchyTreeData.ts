export interface ApiHierarchyNode {
  id: string;
  label: string;
  filePath: string;
  line: number;
  children: ApiHierarchyNode[];
  cycle?: boolean;
}

export interface HierarchyTreeItem {
  id: string;
  label: string;
  secondary: string;
  cycle: boolean;
  filePath: string;
  line: number;
  children: HierarchyTreeItem[];
}

export function buildHierarchyTreeData(
  node: ApiHierarchyNode,
  cycleLabel: string,
): HierarchyTreeItem {
  const cycle = node.cycle === true;
  return {
    id: node.id,
    label: cycle ? `${node.label} ${cycleLabel}` : node.label,
    secondary: `${node.filePath}:${node.line}`,
    cycle,
    filePath: node.filePath,
    line: node.line,
    children: node.children.map(child => buildHierarchyTreeData(child, cycleLabel)),
  };
}

export function findItemById(
  root: HierarchyTreeItem,
  id: string,
): HierarchyTreeItem | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findItemById(child, id);
    if (found) return found;
  }
  return null;
}

export function replaceItemChildren(
  root: HierarchyTreeItem,
  id: string,
  newChildren: HierarchyTreeItem[],
): HierarchyTreeItem {
  if (root.id === id) {
    return { ...root, children: newChildren };
  }
  return {
    ...root,
    children: root.children.map(child => replaceItemChildren(child, id, newChildren)),
  };
}
