import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { C4Model, C4Element, C4Relationship } from '../types';

/** ファイルパスからパッケージ名を抽出する */
function extractPackageName(filePath: string): string | undefined {
  const match = /^packages\/([^/]+)\//.exec(filePath);
  return match?.[1];
}

/** trail-core の解析結果を C4Model に変換する */
export function trailToC4(graph: TrailGraph): C4Model {
  const elements: C4Element[] = [];
  const relationships: C4Relationship[] = [];

  // Collect unique packages (→ containers)
  const packageNodes = new Map<string, Set<string>>(); // pkgName → set of fileIds
  const fileToPackage = new Map<string, string>(); // fileId → pkgName

  for (const node of graph.nodes) {
    if (node.type !== 'file') continue;
    const pkg = extractPackageName(node.filePath);
    if (pkg) {
      if (!packageNodes.has(pkg)) packageNodes.set(pkg, new Set());
      packageNodes.get(pkg)!.add(node.id);
      fileToPackage.set(node.id, pkg);
    }
  }

  // Create container elements for each package
  for (const pkgName of packageNodes.keys()) {
    elements.push({
      id: `pkg_${pkgName}`,
      type: 'container',
      name: pkgName,
    });
  }

  // Create code elements for each file
  for (const node of graph.nodes) {
    if (node.type !== 'file') continue;
    const pkg = fileToPackage.get(node.id);
    elements.push({
      id: node.id,
      type: 'code',
      name: node.label,
      ...(pkg ? { boundaryId: `pkg_${pkg}` } : {}),
    });
  }

  // Create relationships from import edges (deduplicate at package level)
  const pkgRelSet = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type !== 'import') continue;
    const fromPkg = fileToPackage.get(edge.source);
    const toPkg = fileToPackage.get(edge.target);
    if (fromPkg && toPkg && fromPkg !== toPkg) {
      const key = `${fromPkg}→${toPkg}`;
      if (!pkgRelSet.has(key)) {
        pkgRelSet.add(key);
        relationships.push({
          from: `pkg_${fromPkg}`,
          to: `pkg_${toPkg}`,
          label: 'imports',
        });
      }
    }
  }

  return {
    title: 'Project Analysis',
    level: 'component',
    elements,
    relationships,
  };
}
