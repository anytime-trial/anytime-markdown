/**
 * C4 選択要素 詳細パネルに表示する指標データの算出（純粋関数・DOM/FS 非依存）。
 *
 * React 版 `C4ViewerCore.tsx` の `selectedElementInfo` useMemo / `dsmDegreeMap` useMemo を
 * 移植したもの。vanilla 移行（commit e42b06fde）で詳細パネルの DSM / Metrics / Community
 * セクションが欠落したため、その復元用にロジックを純粋関数として切り出す。
 */
import type {
  C4Element,
  C4Model,
  CommunityOverlayEntry,
  ComplexityEntry,
  ComplexityMatrix,
  CoverageEntry,
  CoverageMatrix,
  DsmMatrix,
  HotspotEntry,
  HotspotMap,
  ImportanceMatrix,
  SizeMatrix,
} from '@anytime-markdown/trail-core/c4';
import {
  aggregateDsmToC4ComponentLevel,
  aggregateDsmToC4ContainerLevel,
  aggregateDsmToC4SystemLevel,
  resolveSelectedElementCommunity,
} from '@anytime-markdown/trail-core/c4';
import type { CommunitySummary } from '@anytime-markdown/trail-core/codeGraph';

export interface DsmDegree {
  readonly in: number;
  readonly out: number;
}

export interface SelectedElementSizeMetrics {
  readonly loc: number | null;
  readonly locMax: number | null;
  readonly fileCount: number | null;
  readonly functionCount: number | null;
}

export interface SelectedElementInfo {
  readonly element: C4Element;
  readonly incoming: number | null;
  readonly outgoing: number | null;
  readonly coverage: CoverageEntry | null;
  readonly complexity: ComplexityEntry | null;
  readonly importance: number | null;
  readonly defectRisk: number | null;
  readonly hotspot: HotspotEntry | null;
  readonly community: CommunityOverlayEntry | null;
  readonly sizeMetrics: SelectedElementSizeMetrics;
}

/**
 * DSM 行列（および各 C4 レベルへの集約）から要素 ID 別の In/Out 次数マップを作る。
 * adjacency の行=out 次数、列=in 次数。レベル別に集約して全レベルの要素 ID を網羅する。
 */
export function buildDsmDegreeMap(
  dsmMatrix: DsmMatrix | null,
  elements: readonly C4Element[],
): ReadonlyMap<string, DsmDegree> | null {
  if (!dsmMatrix) return null;
  const map = new Map<string, DsmDegree>();
  const fillFromMatrix = (m: DsmMatrix): void => {
    for (let i = 0; i < m.nodes.length; i++) {
      const out = m.adjacency[i].reduce((sum, v) => sum + (v > 0 ? 1 : 0), 0);
      const inDeg = m.adjacency.reduce((sum, row) => sum + (row[i] > 0 ? 1 : 0), 0);
      map.set(m.nodes[i].id, { in: inDeg, out });
    }
  };
  // L4 (code) は dsmMatrix がそのままファイル単位なのでそのまま使う
  fillFromMatrix(dsmMatrix);
  fillFromMatrix(aggregateDsmToC4ComponentLevel(dsmMatrix, elements));
  fillFromMatrix(aggregateDsmToC4ContainerLevel(dsmMatrix, elements));
  fillFromMatrix(aggregateDsmToC4SystemLevel(dsmMatrix, elements));
  return map;
}

export interface BuildSelectedElementInfoArgs {
  readonly element: C4Element;
  readonly c4Model: C4Model;
  readonly dsmDegreeMap: ReadonlyMap<string, DsmDegree> | null;
  readonly coverageMatrix: CoverageMatrix | null;
  readonly complexityMatrix: ComplexityMatrix | null;
  readonly importanceMatrix: ImportanceMatrix | null;
  readonly defectRiskMap: ReadonlyMap<string, number> | null;
  readonly hotspotMap: HotspotMap | null;
  readonly sizeMatrix: SizeMatrix | null;
  readonly communityOverlayL3: ReadonlyMap<string, CommunityOverlayEntry> | null;
  readonly communityOverlayL4: ReadonlyMap<string, CommunityOverlayEntry> | null;
  readonly communitySummaries?: Record<number, CommunitySummary>;
}

/**
 * 選択要素について、詳細パネルに表示する全指標を解決する。
 * 各 matrix を要素 ID で引き、community は {@link resolveSelectedElementCommunity} で解決する。
 */
export function buildSelectedElementInfo(args: BuildSelectedElementInfoArgs): SelectedElementInfo {
  const {
    element,
    c4Model,
    dsmDegreeMap,
    coverageMatrix,
    complexityMatrix,
    importanceMatrix,
    defectRiskMap,
    hotspotMap,
    sizeMatrix,
    communityOverlayL3,
    communityOverlayL4,
    communitySummaries,
  } = args;

  const dsmDegree = dsmDegreeMap?.get(element.id) ?? null;
  const sizeEntry = sizeMatrix?.[element.id];
  const sizeMetrics: SelectedElementSizeMetrics = sizeEntry
    ? { loc: sizeEntry.loc, locMax: sizeEntry.locMax, fileCount: sizeEntry.files, functionCount: sizeEntry.functions }
    : { loc: null, locMax: null, fileCount: null, functionCount: null };

  return {
    element,
    incoming: dsmDegree?.in ?? null,
    outgoing: dsmDegree?.out ?? null,
    coverage: coverageMatrix?.entries.find((e) => e.elementId === element.id) ?? null,
    complexity: complexityMatrix?.entries.find((e) => e.elementId === element.id) ?? null,
    importance: importanceMatrix?.[element.id] ?? null,
    defectRisk: defectRiskMap?.get(element.id) ?? null,
    hotspot: hotspotMap?.get(element.id) ?? null,
    community: resolveSelectedElementCommunity({
      element,
      c4Model,
      communityOverlayL3,
      communityOverlayL4,
      communitySummaries,
    }),
    sizeMetrics,
  };
}
