export interface ApiHierarchyNode {
  id: string;
  label: string;
  filePath: string;
  line: number;
  children: ApiHierarchyNode[];
  cycle?: boolean;
  revisited?: boolean;
}

export interface HierarchyTreeItem {
  id: string;
  label: string;
  secondary: string;
  cycle: boolean;
  revisited: boolean;
  filePath: string;
  line: number;
  children: HierarchyTreeItem[];
}

export interface HierarchyLabelDecorations {
  readonly cycleLabel: string;
  readonly revisitedLabel: string;
}

export function buildHierarchyTreeData(
  node: ApiHierarchyNode,
  decorations: HierarchyLabelDecorations,
): HierarchyTreeItem {
  const cycle = node.cycle === true;
  const revisited = node.revisited === true;
  const suffix = cycle ? ` ${decorations.cycleLabel}` : revisited ? ` ${decorations.revisitedLabel}` : '';
  return {
    id: node.id,
    label: `${node.label}${suffix}`,
    secondary: `${node.filePath}:${node.line}`,
    cycle,
    revisited,
    filePath: node.filePath,
    line: node.line,
    children: node.children.map(child => buildHierarchyTreeData(child, decorations)),
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
