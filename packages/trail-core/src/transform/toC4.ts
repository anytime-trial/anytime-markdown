import path from 'node:path';
import type { TrailGraph } from '../model/types';
import type { C4Model, C4Element, C4Relationship } from '../model/c4Types';

/**
 * ファイルパスからパッケージ名を抽出する。
 *
 * 1. パスが `packages/[name]/` で始まる場合 → name を返す
 * 2. projectRoot が `packages/[name]` の場合 → name を返す
 * 3. いずれにも該当しない場合 → projectRoot のディレクトリ名を返す
 */
function resolvePackageName(
  filePath: string,
  projectRoot: string,
): string {
  // パス内に packages/ プレフィックスがある場合
  const inPath = /^packages\/([^/]+)\//.exec(filePath);
  if (inPath) return inPath[1];

  // projectRoot から推定
  const normalized = projectRoot.replaceAll('\\', '/');
  const pkgMatch = /\/packages\/([^/]+)\/?$/.exec(normalized);
  if (pkgMatch) return pkgMatch[1];

  // フォールバック: ルートディレクトリ名
  return path.basename(projectRoot);
}

/**
 * ファイルパスからコンポーネント名（src/ 直下のディレクトリ）を抽出する。
 * パッケージルート直下のファイルは undefined を返す。
 *
 * trail-server の GraphClusterer.extractComponentSegment はこの関数を経由して
 * 同一ロジックを共有する（実装の drift を防止）。
 */
export function extractComponentName(filePath: string): string | undefined {
  // packages/[pkg]/src/[dir]/... → dir
  const withPkgSrc = /^packages\/[^/]+\/src\/([^/]+)\//.exec(filePath);
  if (withPkgSrc) return withPkgSrc[1];

  // src/[dir]/... → dir（projectRoot がパッケージの場合）
  const withSrc = /^src\/([^/]+)\//.exec(filePath);
  if (withSrc) return withSrc[1];

  // [dir]/...（src なし、packages/ なし）
  const topDir = /^([^/]+)\//.exec(filePath);
  if (topDir && topDir[1] !== 'src') return topDir[1];

  return undefined;
}

/**
 * 複数パッケージを含むモノレポ解析か判定する。
 * packages/ プレフィックスを持つファイルが存在すれば true。
 */
function isMonorepoAnalysis(graph: TrailGraph): boolean {
  return graph.nodes.some(
    (n) => n.type === 'file' && /^packages\/[^/]+\//.test(n.filePath),
  );
}

type FileClassification = {
  fileToPackage: Map<string, string>;
  fileToComponent: Map<string, string>;
  packageSet: Set<string>;
  componentSet: Set<string>;
};

/** Phase 1: ファイルノードをパッケージ/コンポーネントに分類する。 */
function classifyFiles(graph: TrailGraph, monorepo: boolean, projectRoot: string): FileClassification {
  const fileToPackage = new Map<string, string>();
  const fileToComponent = new Map<string, string>();
  const packageSet = new Set<string>();
  const componentSet = new Set<string>();

  for (const node of graph.nodes) {
    if (node.type !== 'file') continue;
    if (monorepo && !/^packages\/[^/]+\//.test(node.filePath)) continue;

    const pkg = resolvePackageName(node.filePath, projectRoot);
    fileToPackage.set(node.id, pkg);
    packageSet.add(pkg);

    const comp = extractComponentName(node.filePath);
    if (comp) {
      const compKey = `${pkg}/${comp}`;
      fileToComponent.set(node.id, compKey);
      componentSet.add(compKey);
    }
  }
  return { fileToPackage, fileToComponent, packageSet, componentSet };
}

/** Phase 2-4: C4 要素（system / container / component / code）を生成する。 */
function buildElements(
  graph: TrailGraph,
  classification: FileClassification,
  monorepo: boolean,
  systemBoundaryId: string | undefined,
  projectRoot: string,
): C4Element[] {
  const { fileToPackage, fileToComponent, packageSet, componentSet } = classification;
  const elements: C4Element[] = [];

  // L1: System Boundary（モノレポのみ）
  if (monorepo && systemBoundaryId) {
    elements.push({
      id: systemBoundaryId,
      type: 'system',
      name: path.basename(projectRoot),
    });
  }

  // L2: Container 要素
  for (const pkgName of packageSet) {
    elements.push({
      id: `pkg_${pkgName}`,
      type: 'container',
      name: pkgName,
      boundaryId: systemBoundaryId,
    });
  }

  // L3: Component 要素
  for (const compKey of componentSet) {
    const [pkg, comp] = compKey.split('/');
    elements.push({
      id: `pkg_${compKey}`,
      type: 'component',
      name: comp,
      boundaryId: `pkg_${pkg}`,
    });
  }

  // L4: Code 要素
  for (const node of graph.nodes) {
    if (node.type !== 'file') continue;
    const pkg = fileToPackage.get(node.id);
    if (!pkg) continue;
    const compKey = fileToComponent.get(node.id);
    elements.push({
      id: node.id,
      type: 'code',
      name: node.label,
      boundaryId: compKey ? `pkg_${compKey}` : `pkg_${pkg}`,
    });
  }

  return elements;
}

/** Phase 5: エッジから L2/L3/L4 リレーションシップを生成する。 */
function buildRelationships(
  graph: TrailGraph,
  fileToPackage: Map<string, string>,
  fileToComponent: Map<string, string>,
): C4Relationship[] {
  const relationships: C4Relationship[] = [];
  const l2Set = new Set<string>();
  const l3Set = new Set<string>();
  const l4Set = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.type !== 'import') continue;
    const fromPkg = fileToPackage.get(edge.source);
    const toPkg = fileToPackage.get(edge.target);
    if (!fromPkg || !toPkg) continue;

    // L4: ファイル間
    const l4Key = `${edge.source}→${edge.target}`;
    if (!l4Set.has(l4Key)) {
      l4Set.add(l4Key);
      relationships.push({ from: edge.source, to: edge.target, label: 'imports' });
    }

    // L3: コンポーネント間
    const fromComp = fileToComponent.get(edge.source);
    const toComp = fileToComponent.get(edge.target);
    if (fromComp && toComp && fromComp !== toComp) {
      const l3Key = `${fromComp}→${toComp}`;
      if (!l3Set.has(l3Key)) {
        l3Set.add(l3Key);
        relationships.push({ from: `pkg_${fromComp}`, to: `pkg_${toComp}`, label: 'imports' });
      }
    }

    // L2: パッケージ間
    if (fromPkg !== toPkg) {
      const l2Key = `${fromPkg}→${toPkg}`;
      if (!l2Set.has(l2Key)) {
        l2Set.add(l2Key);
        relationships.push({ from: `pkg_${fromPkg}`, to: `pkg_${toPkg}`, label: 'imports' });
      }
    }
  }

  return relationships;
}

/** trail-core の解析結果を C4Model に変換する（L2〜L4） */
export function trailToC4(graph: TrailGraph): C4Model {
  const projectRoot = graph.metadata.projectRoot;
  const monorepo = isMonorepoAnalysis(graph);
  const systemBoundaryId = monorepo ? `sys_${path.basename(projectRoot)}` : undefined;

  const classification = classifyFiles(graph, monorepo, projectRoot);
  const elements = buildElements(graph, classification, monorepo, systemBoundaryId, projectRoot);
  const relationships = buildRelationships(
    graph,
    classification.fileToPackage,
    classification.fileToComponent,
  );

  return {
    title: 'Project Analysis',
    level: 'code',
    elements,
    relationships,
  };
}
