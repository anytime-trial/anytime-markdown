/**
 * C4 Viewer vanilla DOM mount.
 *
 * Reproduces C4ViewerCore.tsx as a framework-free factory.
 * `mountC4Viewer(container, props)` → VanillaViewHandle<C4ViewerViewProps>
 *
 * Architecture:
 *  - State is held in closure variables (graphReducer + UI state).
 *  - 6 data hooks (useHotspot, useDefectRisk, useTemporalCoupling, useElementFunctions,
 *    useFunctionGraph, useCodeGraph) are ported inline as vanilla async functions.
 *  - scheduleRender() microtask-debounces re-renders.
 *  - Child mounts (mountGraphCanvas, mountMinimapCanvas) are created once and
 *    updated on each render via their own handle.update().
 *  - MUI/React: NONE. All UI is raw DOM + inline styles.
 */

import type { GraphDocument, Viewport } from '@anytime-markdown/graph-core';
import { DEFAULT_VIEWPORT, engine, layoutWithSubgroups, state as graphState } from '@anytime-markdown/graph-core';
import type {
  BoundaryInfo,
  C4Element,
  C4ElementType,
  C4GhostEdge,
  C4Model,
  C4ReleaseEntry,
  CommunityOverlayEntry,
  ComplexityMatrix,
  CoverageMatrix,
  DocLink,
  DsmMatrix,
  FeatureMatrix,
  HotspotMap,
  ImportanceMatrix,
  ManualGroup,
  MetricOverlay,
} from '@anytime-markdown/trail-core/c4';
import {
  aggregateDsmToC4ComponentLevel,
  aggregateDsmToC4ContainerLevel,
  aggregateDsmToC4SystemLevel,
  aggregateGhostEdgesToC4,
  aggregateHotspotToC4,
  buildArchitectureMatrix,
  buildLayerMatrix,
  buildC4ElementById,
  buildCommunityTree,
  buildElementTree,
  buildLevelView,
  buildSizeMatrix,
  c4ToGraphDocument,
  collectDescendantIds,
  computeColorMap,
  computeCommunityOverlay,
  computeFileHotspot,
  filterDsmMatrix,
  filterModelForDrill,
  filterTreeByLevel,
  mapFileToC4Elements,
  resolveSelectedElementCommunity,
  sortDsmMatrixByName,
} from '@anytime-markdown/trail-core/c4';
import type { ArchitectureFileEntry, ArchitectureMatrix, LayerMatrix, RoleMatrix, SizeMatrix } from '@anytime-markdown/trail-core/c4';
import type { ArchitectureLayer, CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import type { ConfidenceCouplingEdge, DefectRiskEntry, TemporalCouplingEdge } from '@anytime-markdown/trail-core';

import {
  computeClaudeActivityColorMap,
  computeConflictBorderMap,
  computeMultiAgentColorMap,
} from '../../c4/claudeActivityColorMap';
import { communityColor } from '../../components/communityColors';
import { COMMUNITY_ROLE_LABELS, getCommunityRoleBgColors } from '../../c4/communityRoleColors';
import { buildFunctionGraphDocument } from '../../c4/components/buildFunctionGraphDocument';
import { computeContextMenuCapabilities } from '../../c4/utils/contextMenuCapabilities';
import { buildElementContextMarkdown } from '../../c4/utils/noteExportContext';
import {
  computeBounds,
  fitToContent,
  formatPct,
  getActivityTrendChartWidth,
  matchesDocScope,
  canShowManualContextActions,
} from '../../c4/utils/c4ViewerHelpers';
import { kindBadge } from '../../c4/components/kindBadge';
import { fileAnalysisEntriesForElement } from '../../c4/components/fileAnalysisEntriesForElement';
import { functionAnalysisEntriesForElement } from '../../c4/components/functionAnalysisEntriesForElement';
import {
  CURRENT_RELEASE_TAG,
  DEFAULT_TC_VALUE,
  DRILL_SCOPE_TYPES,
  FILTER_CHECKABLE_TYPES,
  SELECTED_ELEMENT_DETAILS_WIDTH,
  TREND_CHART_POPUP_MAX_WIDTH,
  UNKNOWN_REPO_KEY,
} from '../../c4/constants';
import { OVERLAY_CATEGORY_DEFAULTS, type OverlayCategory } from '../../c4/state/overlayCategories';
import { createInitialState, graphReducer } from '../../c4/state/graphReducer';
import { applyGhostEdgeMode, type TemporalCouplingControlsValue } from '../../c4/components/overlays/TemporalCouplingControls';
import type { HotspotControlsValue } from '../../c4/components/overlays/HotspotControls';

import { getC4Colors, CONTEXT_MENU_SHADOW, DOC_TYPE_COLORS, DOC_TYPE_FALLBACK_COLOR, LOADING_OVERLAY_BG, POPUP_SHADOW, type C4ThemeColors } from '../../theme/c4Tokens';
import { mountGraphCanvas } from './canvases/graphCanvas';
import type { GraphCanvasHandle } from './canvases/graphCanvas';
import { mountMinimapCanvas } from './minimapCanvas';
import type { MinimapCanvasHandle } from './minimapCanvas';
import { mountC4ElementTree } from './panels/c4ElementTreePanel';
import type { C4ElementTreeVanillaProps } from './panels/c4ElementTreePanel';
import { mountHotspotControls } from './overlays/hotspotControls';
import type { HotspotControlsVanillaProps } from './overlays/hotspotControls';
import { mountDefectRiskControls } from './overlays/defectRiskControls';
import type { DefectRiskControlsVanillaProps, DefectRiskControlsValue } from './overlays/defectRiskControls';
import { mountTemporalCouplingControls } from './overlays/temporalCouplingControls';
import type { TemporalCouplingControlsVanillaProps } from './overlays/temporalCouplingControls';
import { mountOverlayLegend } from './overlays/overlayLegend';
import type { OverlayLegendVanillaProps } from './overlays/overlayLegend';
import { mountMatrixPanel } from './panels/matrixPanel';
import type { MatrixPanelVanillaProps } from './panels/matrixPanel';
import { mountScatterPanel } from './panels/scatterPanel';
import type { ScatterPanelProps } from './panels/scatterPanel';
import { mountCodeGraphPanel } from '../codeGraphPanel';
import type { CodeGraphPanelProps } from '../codeGraphPanel';
import type { CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import { mountActivityTrendPanel } from './panels/activityTrendPanel';
import type { ActivityTrendPanelProps } from './panels/activityTrendPanel';
import { mountDeadCodeDetailPanel } from './panels/deadCodeDetailPanel';
import type { DeadCodeDetailPanelProps } from './panels/deadCodeDetailPanel';
import { buildDsmDegreeMap, buildSelectedElementInfo } from './panels/selectedElementInfo';
import type { SelectedElementInfo } from './panels/selectedElementInfo';
import { appendSelectedElementDetailSections } from './panels/selectedElementDetailsPanel';
import { mountCallHierarchyPanel } from './panels/callHierarchyPanel';
import type { CallHierarchyPanelVanillaProps } from './panels/callHierarchyPanel';
import { mountAddElementDialog } from './dialogs/addElementDialog';
import type { AddElementDialogVanillaProps } from './dialogs/addElementDialog';
import { mountAddRelationshipDialog } from './dialogs/addRelationshipDialog';
import type { AddRelationshipDialogVanillaProps } from './dialogs/addRelationshipDialog';
import { mountGroupLabelDialog } from './dialogs/groupLabelDialog';
import type { GroupLabelDialogVanillaProps } from './dialogs/groupLabelDialog';
import { mountResizablePopup } from './widgets/resizablePopup';
import type { ResizablePopupVanillaProps } from './widgets/resizablePopup';
import { mountTourMode } from './tourMode';
import type { TourModeVanillaProps } from './tourMode';
import { buildActivityTrendSeries } from '../../c4/components/panels/ActivityTrendChart';
import { fetchActivityTrendApi } from '../../c4/hooks/fetchActivityTrendApi';
import type { ActivityTrendResponse } from '../../c4/hooks/fetchActivityTrendApi';
import { ACTIVITY_TREND_COLORS, getCoverageColor } from '../../c4/c4MetricColors';
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import {
  createInMemorySheetAdapter,
  type SpreadsheetGridOptions,
} from '@anytime-markdown/spreadsheet-viewer';
import type { CellAlign, HeaderSpan } from '@anytime-markdown/spreadsheet-core';

import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import type { C4ViewerCoreProps } from '../../c4/components/types';
import type { FileAnalysisApiEntry } from '../../c4/hooks/fetchFileAnalysisApi';
import type { FunctionAnalysisApiEntry } from '../../c4/hooks/fetchFunctionAnalysisApi';
import type { ClaudeActivityState, MultiAgentActivityState } from '../../c4/hooks/c4WsMessages';
import type { ElementFormData, RelationshipFormData } from '../../c4/components/dialogs/C4EditDialogs';

// fetch APIs (used by inline hook ports)
import { fetchHotspotApi } from '../../c4/hooks/fetchHotspotApi';
import { fetchDefectRiskApi } from '../../c4/hooks/fetchDefectRiskApi';
import { fetchTemporalCouplingApi } from '../../c4/hooks/fetchTemporalCouplingApi';
import { fetchElementFunctionsApi } from '../../c4/hooks/fetchElementFunctionsApi';
import { fetchFunctionGraph } from '../../c4/hooks/fetchFunctionGraphApi';
import type { FunctionGraphResponse } from '../../c4/hooks/fetchFunctionGraphApi';
import type { ElementFunctionsResponse } from '../../c4/hooks/fetchElementFunctionsApi';
import type { HotspotResponse } from '../../c4/hooks/fetchHotspotApi';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Props for the vanilla mount. Extends C4ViewerCoreProps with theme/i18n
 * values that were previously resolved by React hooks in the component.
 */
export interface C4ViewerViewProps extends C4ViewerCoreProps {
  /** Translation function (e.g. from useTrailI18n). */
  readonly t: (key: string) => string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css?: string, attrs?: Record<string, string>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/**
 * 依存を参照等価で比較する 1 スロットのメモ化（React useMemo の vanilla 等価）。
 * 依存配列の全要素が前回と `===` なら前回値を返す。`render()` がビューポート変更
 * （pan/zoom）ごとに呼ばれても、依存に viewport を含まない重い算出を再実行しないために使う。
 */
function createRefMemo<T>(): (deps: readonly unknown[], compute: () => T) => T {
  let lastDeps: readonly unknown[] | null = null;
  let lastValue: T;
  return (deps, compute) => {
    if (lastDeps !== null && lastDeps.length === deps.length && lastDeps.every((d, i) => d === deps[i])) {
      return lastValue;
    }
    lastDeps = deps;
    lastValue = compute();
    return lastValue;
  };
}

function svgIcon(d: string, size = 16): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

// MUI icon paths (subset used in C4ViewerCore)
const ICONS = {
  groupWork: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z',
  timeline: 'M23 8c0 1.1-.9 2-2 2-.18 0-.35-.02-.51-.07l-3.56 3.55c.05.16.07.34.07.52 0 1.1-.9 2-2 2s-2-.9-2-2c0-.18.02-.36.07-.52l-2.55-2.55c-.16.05-.34.07-.52.07s-.36-.02-.52-.07l-4.55 4.56c.05.16.07.33.07.51 0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2c.18 0 .35.02.51.07l4.56-4.55C8.02 9.36 8 9.18 8 9c0-1.1.9-2 2-2s2 .9 2 2c0 .18-.02.36-.07.52l2.55 2.55c.16-.05.34-.07.52-.07s.36.02.52.07l3.55-3.56C19.02 8.35 19 8.18 19 8c0-1.1.9-2 2-2s2 .9 2 2z',
  trendingUp: 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z',
  layers: 'M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z',
  deleteSweep: 'M15 16h4v2h-4zm0-8h7v2h-7zm0 4h6v2h-6zM3 18c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V8H3v10zM14 5h-3l-1-1H6L5 5H2v2h12z',
  tableChart: 'M20 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 2v3H5V5h15zm-8 14H5v-9h7v9zm8 0h-6v-9h6v9z',
  scatterPlot: 'M7 3H5v2H3v2h2v2h2V7h2V5H7V3zm9 8h-2v2h-2v2h2v2h2v-2h2v-2h-2v-2zm-4-2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6 10h-2v2h2v-2zm-4 0h-2v2h2v-2zm8-4h-2v2h2v-2zm0 4h-2v2h2v-2z',
  filterAltOff: 'M19.79 5.61C20.3 4.95 19.83 4 19 4H6.83l7.97 7.97 4.99-6.36zM2.81 2.81L1.39 4.22 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-2.17l5.78 5.78 1.41-1.41L2.81 2.81z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  accountTree: 'M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
} as const;

// ---------------------------------------------------------------------------
// Matrix grid computation helpers (port of MatrixPanel.tsx logic)
// ---------------------------------------------------------------------------

function matrixBuildSpansFromKey(keys: readonly string[]): HeaderSpan[] {
  const spans: HeaderSpan[] = [];
  let currentLabel = '';
  let currentSpan = 0;
  for (const key of keys) {
    if (key === currentLabel) {
      currentSpan++;
    } else {
      if (currentSpan > 0) spans.push({ label: currentLabel, span: currentSpan });
      currentLabel = key;
      currentSpan = 1;
    }
  }
  if (currentSpan > 0) spans.push({ label: currentLabel, span: currentSpan });
  return spans;
}

function matrixBuildCoverageBreadcrumb(
  elementId: string,
  level: 'package' | 'component' | 'code',
  elementById: ReadonlyMap<string, C4Element>,
): string {
  const elem = elementById.get(elementId);
  if (!elem) return elementId;
  if (level === 'package') return elem.name;
  if (level === 'component') {
    const container = elem.boundaryId ? elementById.get(elem.boundaryId) : null;
    return container ? `${container.name} / ${elem.name}` : elem.name;
  }
  const component = elem.boundaryId ? elementById.get(elem.boundaryId) : null;
  const container = component?.boundaryId ? elementById.get(component.boundaryId) : null;
  return [container?.name, component?.name, elem.name].filter(Boolean).join(' / ');
}

interface MatrixSheetData {
  cells: string[][];
  alignments: CellAlign[][];
  range: { rows: number; cols: number };
}

function matrixCoverageToSheet(
  matrix: CoverageMatrix,
  c4Model: C4Model,
  complexityMatrix: ComplexityMatrix | null,
  churnCountMap: ReadonlyMap<string, number> | null,
): MatrixSheetData {
  const elementById = new Map(c4Model.elements.map(e => [e.id, e]));
  const complexityMap = new Map(complexityMatrix?.entries.map(e => [e.elementId, e.totalCount]) ?? []);
  const headerRow = ['Component', 'Lines%', 'Branches%', 'Functions%', 'Complexity', 'LOC', 'Commits'];
  const dataRows = matrix.entries.map(e => {
    const complexity = complexityMap.get(e.elementId);
    const commits = churnCountMap?.get(e.elementId);
    return [
      elementById.get(e.elementId)?.name ?? e.elementId,
      String(Math.round(e.lines.pct * 10) / 10),
      String(Math.round(e.branches.pct * 10) / 10),
      String(Math.round(e.functions.pct * 10) / 10),
      complexity != null ? String(complexity) : '',
      e.lines.total > 0 ? String(e.lines.total) : '',
      commits != null ? String(commits) : '',
    ];
  });
  const cells = [headerRow, ...dataRows];
  const alignments = cells.map(r => r.map((): CellAlign => 'right'));
  return { cells, alignments, range: { rows: cells.length, cols: 7 } };
}

function matrixMakeSheetResult(sheet: MatrixSheetData): {
  colHeaders: string[];
  rowHeaders: string[];
  adapter: ReturnType<typeof createInMemorySheetAdapter>;
} {
  const colHeaders = sheet.cells[0]?.slice(1) ?? [];
  const dataRows = sheet.cells.slice(1).map(r => r.slice(1));
  const dataAligns = sheet.alignments.slice(1).map(r => r.slice(1));
  const rowHeaders = sheet.cells.slice(1).map(r => r[0] ?? '');
  const cols = Math.max(0, sheet.range.cols - 1);
  const adapter = createInMemorySheetAdapter(
    { cells: dataRows, alignments: dataAligns, range: { rows: dataRows.length, cols } },
    { readOnly: true },
  );
  return { colHeaders, rowHeaders, adapter };
}

export function computeMatrixGridOptions(
  level: 'package' | 'component' | 'code',
  c4Model: C4Model | null,
  coverageMatrix: CoverageMatrix | null,
  complexityMatrix: ComplexityMatrix | null,
  hotspotData: HotspotResponse | null,
  codeGraph: CodeGraph | null,
  selectedRepo: string,
  filterElementId: string | null,
  showCommunity: boolean,
): Omit<SpreadsheetGridOptions, 'isDark'> | null {
  if (!c4Model || !coverageMatrix) return null;

  // Churn count map from hotspot data
  const churnCountMap: ReadonlyMap<string, number> | null = (() => {
    if (!hotspotData?.files.length) return null;
    const elementById = buildC4ElementById(c4Model.elements);
    const map = new Map<string, number>();
    for (const entry of hotspotData.files) {
      for (const m of mapFileToC4Elements(entry.filePath, elementById)) {
        map.set(m.elementId, (map.get(m.elementId) ?? 0) + entry.churn);
      }
    }
    return map.size > 0 ? map : null;
  })();

  // Filter scope by descendant element if requested
  const filterScopeIds: ReadonlySet<string> | null = (() => {
    if (!filterElementId) return null;
    const ids = collectDescendantIds(c4Model.elements, filterElementId);
    return ids.size > 0 ? ids : null;
  })();

  // Filter coverage matrix by level and scope
  const typeFilter: Set<C4ElementType> =
    level === 'package' ? new Set(['container', 'containerDb'] as C4ElementType[]) :
    level === 'code'    ? new Set(['code'] as C4ElementType[]) :
                             new Set(['component'] as C4ElementType[]);
  let validIds = new Set(c4Model.elements.filter(e => typeFilter.has(e.type)).map(e => e.id));
  if (filterScopeIds) {
    validIds = new Set([...validIds].filter(id => filterScopeIds.has(id)));
  }
  const elementById = new Map(c4Model.elements.map(e => [e.id, e]));
  const filteredEntries = coverageMatrix.entries
    .filter(e => validIds.has(e.elementId))
    .sort((a, b) =>
      matrixBuildCoverageBreadcrumb(a.elementId, level, elementById)
        .localeCompare(matrixBuildCoverageBreadcrumb(b.elementId, level, elementById)),
    );

  if (filteredEntries.length === 0) return null;

  const filteredMatrix: CoverageMatrix = { ...coverageMatrix, entries: filteredEntries };
  const sheetData = matrixCoverageToSheet(filteredMatrix, c4Model, complexityMatrix, churnCountMap);
  const { colHeaders, rowHeaders, adapter } = matrixMakeSheetResult(sheetData);
  const snap = adapter.getSnapshot();
  const gridRows = snap.range.rows;
  const gridCols = snap.range.cols;

  // Row header groups (hierarchy spans)
  const coverageRowHeaderGroups: readonly (readonly HeaderSpan[])[] | undefined = (() => {
    if (level === 'package') return undefined;
    if (level === 'component') {
      const containerKeys = filteredEntries.map(e => {
        const el = elementById.get(e.elementId);
        return (el?.boundaryId ? elementById.get(el.boundaryId)?.name : undefined) ?? '';
      });
      return [matrixBuildSpansFromKey(containerKeys)];
    }
    // code: container + component spans
    const containerKeys = filteredEntries.map(e => {
      const el = elementById.get(e.elementId);
      const comp = el?.boundaryId ? elementById.get(el.boundaryId) : null;
      return (comp?.boundaryId ? elementById.get(comp.boundaryId)?.name : undefined) ?? '';
    });
    const componentKeys = filteredEntries.map(e => {
      const el = elementById.get(e.elementId);
      return (el?.boundaryId ? elementById.get(el.boundaryId)?.name : undefined) ?? '';
    });
    return [matrixBuildSpansFromKey(containerKeys), matrixBuildSpansFromKey(componentKeys)];
  })();

  // Community color per element
  const communityColorByElement: ReadonlyMap<string, string> | null = (() => {
    if (!showCommunity || !codeGraph) return null;
    const overlay = computeCommunityOverlay(c4Model, codeGraph, 3, selectedRepo || null);
    if (!overlay || overlay.size === 0) return null;
    const map = new Map<string, string>();
    for (const [elementId, entry] of overlay) {
      map.set(elementId, communityColor(entry.dominantCommunity));
    }
    return map.size > 0 ? map : null;
  })();

  const getRowHeaderBackground = communityColorByElement
    ? (rowIndex: number) => communityColorByElement.get(filteredEntries[rowIndex]?.elementId ?? '')
    : undefined;

  const getCellBackground = (_row: number, col: number, value: string): string | undefined => {
    if (col > 2) return undefined;
    const pct = Number.parseFloat(value);
    if (Number.isNaN(pct)) return undefined;
    return getCoverageColor(pct) + '55';
  };

  return {
    adapter,
    showApply: false,
    showRange: false,
    showToolbar: false,
    columnHeaders: colHeaders,
    rowHeaders,
    rowHeaderWidth:
      level === 'code'      ? 280 :
      level === 'component' ? 200 :
      120,
    rowHeaderGroups: coverageRowHeaderGroups,
    gridRows,
    gridCols,
    getCellBackground,
    getRowHeaderBackground: showCommunity ? getRowHeaderBackground : undefined,
  };
}

// ---------------------------------------------------------------------------
// Vanilla async data fetchers (inline ports of the 6 hooks)
// ---------------------------------------------------------------------------

interface HotspotState {
  data: HotspotResponse | null;
  loading: boolean;
  controller: AbortController | null;
  timer: ReturnType<typeof setTimeout> | null;
}

interface DefectRiskState {
  entries: DefectRiskEntry[];
  loading: boolean;
  controller: AbortController | null;
  timer: ReturnType<typeof setTimeout> | null;
}

interface TCState {
  edges: TemporalCouplingEdge[] | ConfidenceCouplingEdge[];
  granularity: 'commit' | 'session' | 'subagentType';
  loading: boolean;
  controller: AbortController | null;
  timer: ReturnType<typeof setTimeout> | null;
}

interface ElementFunctionsState {
  data: ElementFunctionsResponse | null;
  loading: boolean;
  controller: AbortController | null;
}

interface FunctionGraphState {
  data: FunctionGraphResponse | null;
  loading: boolean;
  error: Error | null;
  controller: AbortController | null;
}

interface CodeGraphState {
  graph: CodeGraph | null;
  loading: boolean;
  ws: WebSocket | null;
  controller: AbortController | null;
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountC4Viewer(
  container: HTMLElement,
  initialProps: C4ViewerViewProps,
): VanillaViewHandle<C4ViewerViewProps> {
  let props = initialProps;
  let destroyed = false;

  // ── Graph reducer state ──
  let graphState_ = createInitialState();
  const graphDispatch = (action: graphState.Action): void => {
    graphState_ = graphReducer(graphState_, action);
    scheduleRender();
  };

  // ── L5 viewport (isolated from main graph reducer) ──
  let l5Viewport: Viewport = { ...DEFAULT_VIEWPORT };

  // ── Canvas ref (shared with minimap) ──
  const canvasRef: { current: HTMLCanvasElement | null } = { current: null };

  // ── Pending fit counter (countdown pattern from C4ViewerCore) ──
  let pendingFitCount = 0;
  let pendingCenterC4Id: string | null = null;

  // ── UI state ──
  let fullDoc: GraphDocument | null = null;
  let currentLevel = props.initialLevel ?? 1;
  let showCoverage = false;
  let showAncestorEdges = false;
  let matrixPopup: { initialLevel: 'package' | 'component' | 'code'; filterElementId: string | null } | null = null;
  let scatterPopup: { filterElementId: string | null } | null = null;
  let showGraphPopup = false;
  let metricOverlay: MetricOverlay = 'none';
  let overlayCategory: OverlayCategory = 'none';
  let drWindowDays = 90;
  let tcValue: TemporalCouplingControlsValue = DEFAULT_TC_VALUE;
  let hotspotValue: HotspotControlsValue = { period: '30d', granularity: 'commit' };
  let selectedElementId: string | null = null;
  let selectedElementIds: readonly string[] = [];
  let drillStack: readonly { element: C4Element; prevLevel: number; prevCheckedIds: ReadonlySet<string> | null }[] = [];
  let contextMenu: { x: number; y: number; c4Id: string } | null = null;
  let checkedPackageIds: ReadonlySet<string> | null = null;
  // key 変化で C4ElementTree のチェック・展開状態を新ツリーに再構築させる（旧 checkReset state）。
  let checkResetState: { key: number; ids: ReadonlySet<string> | null; expanded: ReadonlySet<string> | null } = { key: 0, ids: null, expanded: null };
  let soloFrameId: string | null = null;
  let centerOnSelect = false;
  let showCommunity = false;
  let codeGraphEnabled = false;
  let showActivityTrend = false;
  let dsmLevel: 'package' | 'component' | 'code' = 'component';
  let selectedRepoInternal = '';

  // ── Data states ──
  const hotspotState: HotspotState = { data: null, loading: false, controller: null, timer: null };
  const defectRiskState: DefectRiskState = { entries: [], loading: false, controller: null, timer: null };
  const tcState: TCState = { edges: [], granularity: 'commit', loading: false, controller: null, timer: null };
  const elemFnsState: ElementFunctionsState = { data: null, loading: false, controller: null };
  const fnGraphState: FunctionGraphState = { data: null, loading: false, error: null, controller: null };
  const codeGraphState: CodeGraphState = { graph: null, loading: false, ws: null, controller: null };

  // ── Dialog state ──
  let addElementDialogOpen = false;
  let addElementDialogType: 'person' | 'system' | 'container' | 'component' = 'system';
  // 非 null のとき AddElementDialog は編集モード（onUpdateElement を呼ぶ）。add 時は null。
  let editElementId: string | null = null;
  let addRelationshipDialogOpen = false;
  let addRelationshipDialogFrom = '';
  let groupLabelDialogOpen = false;

  // ── Defect risk UI state ──
  let defectRiskValue: DefectRiskControlsValue = { enabled: false, windowDays: 90, halfLifeDays: 90 };

  // ── Scatter / tour state ──
  let scatterViewMode: 'scatter' | 'galaxy' | 'city' = 'scatter';
  let tourActive = false;

  // ── Call hierarchy state ──
  let callHierarchyRoot: { filePath: string; fnName: string; startLine?: number } | null = null;

  // ── Activity trend state ──
  let trendPeriod = '30d';
  interface TrendDataState {
    commit: ActivityTrendResponse | null;
    read: ActivityTrendResponse | null;
    write: ActivityTrendResponse | null;
    defect: ActivityTrendResponse | null;
    loading: boolean;
    controllers: AbortController[];
    timers: ReturnType<typeof setTimeout>[];
  }
  const trendDataState: TrendDataState = {
    commit: null, read: null, write: null, defect: null,
    loading: false, controllers: [], timers: [],
  };

  // ── Render scheduling ──
  let renderPending = false;
  function scheduleRender(): void {
    if (destroyed || renderPending) return;
    renderPending = true;
    queueMicrotask(() => {
      renderPending = false;
      if (!destroyed) render();
    });
  }

  // ── DOM Layout ──
  const root = el('div', `display:flex;flex-direction:column;height:${props.containerHeight ?? '100vh'};background:${getC4Colors(props.isDark ?? false).bg};`);
  container.appendChild(root);

  // Loading overlay (for analysisProgress)
  const loadingOverlay = el('div', `display:none;position:fixed;inset:0;z-index:1300;align-items:center;justify-content:center;background:${LOADING_OVERLAY_BG};backdrop-filter:blur(4px);`, { role: 'dialog', 'aria-label': 'Analysis in progress', 'aria-live': 'polite' });
  root.appendChild(loadingOverlay);

  const loadingCard = el('div');
  loadingOverlay.appendChild(loadingCard);

  const loadingTitle = el('div', 'font-weight:600;margin-bottom:4px;');
  loadingTitle.textContent = 'Analyzing Workspace';
  const loadingPhase = el('div', 'margin-bottom:8px;font-size:0.875rem;');
  const loadingProgress = el('div', 'height:6px;border-radius:3px;overflow:hidden;');
  const loadingBar = el('div', 'height:100%;width:0;background:var(--am-color-accent,#90CAF9);transition:width 300ms;');
  loadingProgress.appendChild(loadingBar);
  const loadingPct = el('div', 'font-size:0.75rem;margin-top:4px;');
  loadingCard.append(loadingTitle, loadingPhase, loadingProgress, loadingPct);

  // Main body
  const body = el('div', 'flex:1;display:flex;overflow:hidden;');
  root.appendChild(body);

  // Left tree panel host
  const treeHost = el('div', 'flex-shrink:0;overflow:hidden;');
  body.appendChild(treeHost);

  // Center graph area
  const graphArea = el('div', 'flex:1;display:flex;flex-direction:column;min-width:100px;position:relative;');
  body.appendChild(graphArea);

  // Graph canvas area (fills flex)
  const graphCanvasArea = el('div', 'flex:1;position:relative;overflow:hidden;');
  graphArea.appendChild(graphCanvasArea);

  // L5 placeholder (hidden by default)
  const l5Placeholder = el('div', 'display:none;height:100%;align-items:center;justify-content:center;text-align:center;padding:32px;');
  graphCanvasArea.appendChild(l5Placeholder);

  // Left controls panel (minimap + controls)
  // minimap+controls+overlay パネル(hotspot/TC/legend)を縦積みするため、列全体が
  // キャンバス下端を超えないよう上限を設けて内部スクロールさせる(top:8+下端余白8=16)。
  const leftPanel = el('div', 'position:absolute;top:8px;left:8px;z-index:10;display:flex;flex-direction:column;gap:8px;max-height:calc(100% - 16px);overflow-y:auto;overflow-x:hidden;');
  graphCanvasArea.appendChild(leftPanel);

  // Controls box
  const controlsBox = el('div', `width:220px;border:1px solid ${getC4Colors(false).border};border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;backdrop-filter:blur(10px);box-shadow:${POPUP_SHADOW};`);
  leftPanel.appendChild(controlsBox);

  // Level buttons
  const levelSection = el('div');
  const levelLabel = el('div', 'font-size:0.65rem;margin-bottom:4px;display:block;');
  levelLabel.textContent = 'C4 Level';
  const levelButtons = el('div', 'display:flex;gap:1px;');
  const levelBtns: HTMLButtonElement[] = [];
  for (let i = 1; i <= 5; i++) {
    const btn = el('button', 'flex:1;padding:2px 0;font-size:0.75rem;font-weight:600;border-radius:4px;cursor:pointer;border:1px solid;transition:all 200ms;', { type: 'button' });
    const labels: Record<number, string> = { 1: 'Context', 2: 'Container', 3: 'Component', 4: 'Code', 5: 'Functions' };
    btn.textContent = `C${i}`;
    btn.setAttribute('aria-label', `Level ${i}: ${labels[i]}`);
    btn.title = labels[i] ?? '';
    btn.setAttribute('aria-pressed', String(currentLevel === i));
    const lvl = i;
    btn.addEventListener('click', () => handleSetLevel(lvl));
    levelBtns.push(btn);
    levelButtons.appendChild(btn);
  }
  levelSection.append(levelLabel, levelButtons);
  controlsBox.appendChild(levelSection);

  // Icon toggle row
  const toggleRow = el('div', 'display:flex;gap:4px;flex-direction:row;');
  function iconBtn(ariaLabel: string, iconPath: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'padding:3px;border-radius:4px;border:1px solid transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;background:transparent;transition:all 200ms;', { type: 'button', 'aria-label': ariaLabel, title });
    b.appendChild(svgIcon(iconPath));
    b.addEventListener('click', onClick);
    return b;
  }

  const communityBtn = iconBtn('Community', ICONS.groupWork, 'Community', () => { setShowCommunity(!showCommunity); });
  const ghostEdgeBtn = iconBtn('Ghost Edges', ICONS.timeline, 'Ghost Edges', () => {
    tcValue = (() => {
      const nextMode = tcValue.enabled ? 'none' : tcValue.granularity === 'session' ? 'session' : 'commit';
      return applyGhostEdgeMode(tcValue, nextMode as 'none' | 'commit' | 'session');
    })();
    scheduleRender();
    fetchTC();
  });
  const trendBtn = iconBtn('Activity Trend', ICONS.trendingUp, 'Activity Trend', () => { showActivityTrend = !showActivityTrend; scheduleRender(); fetchActivityTrend(); });
  const upperLinesBtn = iconBtn('Upper Lines', ICONS.layers, 'Upper Lines', () => { showAncestorEdges = !showAncestorEdges; scheduleRender(); rebuildDocument(); });
  const clearHistoryBtn = iconBtn('Clear Activity', ICONS.deleteSweep, 'Clear Activity', () => { props.onResetClaudeActivity?.(); });
  toggleRow.append(communityBtn, ghostEdgeBtn, trendBtn, upperLinesBtn, clearHistoryBtn);
  controlsBox.appendChild(toggleRow);

  // Overlay section
  const overlaySection = el('div');
  const overlayHeader = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:4px;');
  const overlayLabel = el('div', 'font-size:0.65rem;');
  overlayLabel.textContent = '';  // filled by render via t()

  const popupBtnRow = el('div', 'display:flex;align-items:center;gap:2px;');
  function toggleGraphPopup(): void {
    showGraphPopup = !showGraphPopup;
    if (showGraphPopup) {
      matrixPopup = null;
      scatterPopup = null;
      // The popup renders the code graph; ensure it is fetched/enabled.
      codeGraphEnabled = true;
      fetchCodeGraph();
    }
    scheduleRender();
  }
  // 選択要素の type に応じて Matrix ポップアップを開く（React openMatrixForElement の移植）。
  function openMatrixForElement(element: C4Element): void {
    showGraphPopup = false;
    scatterPopup = null;
    if (element.type === 'container' || element.type === 'containerDb') {
      matrixPopup = { initialLevel: 'component', filterElementId: element.id };
    } else if (element.type === 'component') {
      matrixPopup = { initialLevel: 'code', filterElementId: element.id };
    } else if (element.type === 'code') {
      matrixPopup = { initialLevel: 'code', filterElementId: element.boundaryId ?? null };
    } else {
      matrixPopup = { initialLevel: 'component', filterElementId: null };
    }
    scheduleRender();
  }
  const graphPopupBtn = iconBtn('Code Graph', ICONS.accountTree, props.t('c4.graph.title'), toggleGraphPopup);
  const matrixPopupBtn = iconBtn('Matrix', ICONS.tableChart, props.t('c4.matrix.title'), () => {
    if (matrixPopup) { matrixPopup = null; } else { showGraphPopup = false; scatterPopup = null; matrixPopup = { initialLevel: 'component', filterElementId: null }; }
    scheduleRender();
  });
  const scatterPopupBtn = iconBtn('Scatter', ICONS.scatterPlot, props.t('c4.scatter.title'), () => {
    if (scatterPopup) { scatterPopup = null; } else { showGraphPopup = false; matrixPopup = null; scatterPopup = { filterElementId: null }; }
    scheduleRender();
  });
  popupBtnRow.append(graphPopupBtn, matrixPopupBtn, scatterPopupBtn);
  overlayHeader.append(overlayLabel, popupBtnRow);

  const overlaySelect = el('select', 'font-size:0.75rem;height:28px;width:100%;');
  overlaySelect.addEventListener('change', () => {
    handleOverlayCategoryChange(overlaySelect.value as OverlayCategory);
  });

  const overlaySubSelect = el('select', 'font-size:0.75rem;height:28px;width:100%;display:none;');
  overlaySubSelect.addEventListener('change', () => {
    metricOverlay = overlaySubSelect.value as MetricOverlay;
    // layer overlay は code graph のノード layer を集約するため、未取得なら取得を起動する。
    if (metricOverlay === 'architecture-layer') fetchCodeGraph();
    scheduleRender();
  });

  overlaySection.append(overlayHeader, overlaySelect, overlaySubSelect);
  controlsBox.appendChild(overlaySection);

  // Separator
  const sep = el('div', 'border-top:1px solid;margin:0 -12px;');
  controlsBox.appendChild(sep);

  // Frame filter reset button (conditionally visible)
  const frameFilterBtn = el('button', 'display:none;width:100%;padding:4px 8px;font-size:0.75rem;text-align:left;background:transparent;border:none;cursor:pointer;', { type: 'button' });
  frameFilterBtn.appendChild(svgIcon(ICONS.filterAltOff, 14));
  const frameFilterLabel = document.createTextNode('');
  frameFilterBtn.appendChild(frameFilterLabel);
  frameFilterBtn.addEventListener('click', handleClearFrameFilter);
  controlsBox.appendChild(frameFilterBtn);

  // Multi-agent badge (conditionally visible)
  const multiAgentBadge = el('div', 'display:none;font-size:0.65rem;');
  controlsBox.appendChild(multiAgentBadge);

  // Activity trend panel
  const trendPanel = el('div', `display:none;position:absolute;bottom:8px;left:260px;width:320px;max-width:${TREND_CHART_POPUP_MAX_WIDTH}px;border-radius:8px;backdrop-filter:blur(10px);overflow:hidden;box-shadow:${POPUP_SHADOW};transition:width 150ms;`, { role: 'dialog', 'aria-label': 'Activity Trend' });
  graphCanvasArea.appendChild(trendPanel);

  // Context menu
  const ctxMenuOverlay = el('div', 'display:none;position:fixed;inset:0;z-index:1000;');
  const ctxMenuEl = el('div', `display:none;position:fixed;z-index:1001;border-radius:4px;min-width:140px;padding:4px 0;box-shadow:${CONTEXT_MENU_SHADOW};`);
  document.body.appendChild(ctxMenuOverlay);
  document.body.appendChild(ctxMenuEl);
  ctxMenuOverlay.addEventListener('mousedown', handleCloseContextMenu);
  ctxMenuEl.addEventListener('mousedown', (e) => e.stopPropagation());

  // Selected element info panel (right side)
  const elemInfoPanel = el('div', `display:none;position:absolute;top:8px;right:8px;width:${SELECTED_ELEMENT_DETAILS_WIDTH}px;max-height:calc(100% - 20px);overflow:auto;z-index:10;border-radius:8px;backdrop-filter:blur(10px);box-shadow:${POPUP_SHADOW};padding:10px 12px;`, { role: 'dialog', 'aria-label': 'Selected C4 element details' });
  graphCanvasArea.appendChild(elemInfoPanel);

  // Multi-select info panel (right side)
  const multiSelectPanel = el('div', `display:none;position:absolute;top:8px;right:8px;width:${SELECTED_ELEMENT_DETAILS_WIDTH}px;max-height:calc(100% - 20px);overflow:auto;z-index:10;border-radius:8px;backdrop-filter:blur(10px);box-shadow:${POPUP_SHADOW};padding:10px 12px;`, { role: 'dialog', 'aria-label': 'Multiple C4 elements selected' });
  graphCanvasArea.appendChild(multiSelectPanel);

  // Community info panel (right side)
  const communityInfoPanel = el('div', `display:none;position:absolute;top:8px;right:8px;width:${SELECTED_ELEMENT_DETAILS_WIDTH}px;max-height:calc(100% - 20px);overflow:auto;z-index:10;border-radius:8px;backdrop-filter:blur(10px);box-shadow:${POPUP_SHADOW};padding:10px 12px;`, { role: 'dialog', 'aria-label': 'Selected community details' });
  graphCanvasArea.appendChild(communityInfoPanel);

  // Resizable popup host (matrix/scatter/graph - simplified to fixed position)
  const popupHost = el('div', 'position:absolute;inset:0;pointer-events:none;z-index:20;');
  graphCanvasArea.appendChild(popupHost);

  // Dialogs area host
  const dialogsHost = el('div');
  root.appendChild(dialogsHost);

  // ── Child mounts ──
  let graphCanvasHandle: GraphCanvasHandle | null = null;
  let minimapHandle: MinimapCanvasHandle | null = null;

  // ── Panel / overlay / dialog handles ──
  let treeHandle: ReturnType<typeof mountC4ElementTree> | null = null;
  let hotspotControlsHandle: ReturnType<typeof mountHotspotControls> | null = null;
  let defectRiskControlsHandle: ReturnType<typeof mountDefectRiskControls> | null = null;
  let tcControlsHandle: ReturnType<typeof mountTemporalCouplingControls> | null = null;
  let overlayLegendHandle: ReturnType<typeof mountOverlayLegend> | null = null;
  let matrixPopupHandle: ReturnType<typeof mountResizablePopup> | null = null;
  let matrixInnerHandle: ReturnType<typeof mountMatrixPanel> | null = null;
  // オブジェクト参照ごとに単調増加の版番号を割り当てる（Matrix のデータ世代署名用）。
  // 非同期 fetch が新しいオブジェクトを代入すると版番号が変わり、matrixPanel が remount する。
  const refVersion = (() => {
    let seq = 0;
    const map = new WeakMap<object, number>();
    return (obj: unknown): number => {
      if (obj == null || typeof obj !== 'object') return 0;
      let v = map.get(obj as object);
      if (v === undefined) { seq += 1; v = seq; map.set(obj as object, v); }
      return v;
    };
  })();
  let scatterPopupHandle: ReturnType<typeof mountResizablePopup> | null = null;
  let scatterInnerHandle: ReturnType<typeof mountScatterPanel> | null = null;
  let graphPopupHandle: ReturnType<typeof mountResizablePopup> | null = null;
  let graphInnerHandle: ReturnType<typeof mountCodeGraphPanel> | null = null;
  let graphPanelHighlighted: ReadonlySet<string> = new Set();
  let graphPanelSelectedNode: CodeGraphNode | null = null;
  let trendPanelHandle: ReturnType<typeof mountActivityTrendPanel> | null = null;
  let deadCodeHandle: ReturnType<typeof mountDeadCodeDetailPanel> | null = null;
  let callHierarchyHandle: ReturnType<typeof mountCallHierarchyPanel> | null = null;
  let addElementDialogHandle: ReturnType<typeof mountAddElementDialog> | null = null;
  let addRelationshipDialogHandle: ReturnType<typeof mountAddRelationshipDialog> | null = null;
  let groupLabelDialogHandle: ReturnType<typeof mountGroupLabelDialog> | null = null;

  // Minimap host
  const minimapHost = el('div', 'width:220px;');
  leftPanel.insertBefore(minimapHost, controlsBox);

  // ── Computed / derived values (recalculated each render) ──

  function getSelectedRepo(): string {
    return props.selectedRepo ?? selectedRepoInternal;
  }

  function getRepoOptions(): string[] {
    const seen = new Set<string>();
    for (const r of props.releases ?? []) {
      const key = r.repoName ?? (r.tag === CURRENT_RELEASE_TAG ? '' : UNKNOWN_REPO_KEY);
      if (!key) continue;
      seen.add(key);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }

  function getColors(): C4ThemeColors {
    return getC4Colors(props.isDark ?? false);
  }

  function getLevelTargetType(): string {
    return currentLevel === 1 ? 'system' : currentLevel === 2 ? 'container' : currentLevel === 3 ? 'component' : 'code';
  }

  function getElementTypeById(): Map<string, string> {
    return new Map((props.c4Model?.elements ?? []).map((e) => [e.id, e.type]));
  }

  // ── Document building ──
  function rebuildDocument(): void {
    const { c4Model, boundaries: boundaryInfos, manualGroups } = props;
    if (!c4Model) return;

    const currentDrillRoot = drillStack.at(-1)?.element ?? null;
    let filteredModel = currentDrillRoot ? filterModelForDrill(c4Model, currentDrillRoot.id) : c4Model;

    if (checkedPackageIds) {
      const excluded = new Set<string>();
      for (const elem of filteredModel.elements) {
        if (FILTER_CHECKABLE_TYPES.has(elem.type as 'container') && !checkedPackageIds.has(elem.id)) {
          excluded.add(elem.id);
          for (const id of collectDescendantIds(filteredModel.elements, elem.id)) excluded.add(id);
        }
      }
      if (excluded.size > 0) {
        filteredModel = {
          ...filteredModel,
          elements: filteredModel.elements.filter(e => !excluded.has(e.id)),
          relationships: filteredModel.relationships.filter(r => !excluded.has(r.from) && !excluded.has(r.to)),
        };
      }
    }

    if (soloFrameId) {
      const keepIds = new Set<string>([soloFrameId]);
      for (const id of collectDescendantIds(filteredModel.elements, soloFrameId)) keepIds.add(id);
      filteredModel = {
        ...filteredModel,
        elements: filteredModel.elements.filter(e => keepIds.has(e.id)),
        relationships: filteredModel.relationships.filter(r => keepIds.has(r.from) && keepIds.has(r.to)),
      };
    }

    const doc = c4ToGraphDocument(filteredModel, boundaryInfos, manualGroups);
    layoutWithSubgroups(doc, 'TB', 180, 60);
    fullDoc = doc;

    let viewDoc = currentLevel < 4 || !showAncestorEdges
      ? (() => {
        const v = buildLevelView(doc, currentLevel, { showAncestorEdges });
        layoutWithSubgroups(v, 'TB', 180, 60);
        return v;
      })()
      : doc;

    if (pendingFitCount > 0) {
      pendingFitCount--;
      const canvas = canvasRef.current;
      if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        const bounds = computeBounds(viewDoc.nodes);
        let viewport = fitToContent(canvas.clientWidth, canvas.clientHeight, bounds);
        const centerTarget = pendingCenterC4Id;
        if (centerTarget) {
          const targetNode = viewDoc.nodes.find(n => (n.metadata?.c4Id as string | undefined) === centerTarget);
          if (targetNode) {
            pendingCenterC4Id = null;
            const cx = targetNode.x + targetNode.width / 2;
            const cy = targetNode.y + targetNode.height / 2;
            viewport = {
              ...viewport,
              offsetX: canvas.clientWidth / 2 - cx * viewport.scale,
              offsetY: canvas.clientHeight / 2 - cy * viewport.scale,
            };
          }
        }
        viewDoc = { ...viewDoc, viewport };
      }
    }

    graphDispatch({ type: 'SET_DOCUMENT', doc: viewDoc });
  }

  // ── Data fetch: Hotspot ──
  function fetchHotspot(): void {
    if (destroyed) return;
    const { serverUrl } = props;
    if (!serverUrl) { hotspotState.data = null; hotspotState.loading = false; scheduleRender(); return; }
    if (hotspotState.timer !== null) clearTimeout(hotspotState.timer);
    hotspotState.controller?.abort();
    const ctrl = new AbortController();
    hotspotState.controller = ctrl;
    hotspotState.timer = setTimeout(() => {
      hotspotState.loading = true;
      scheduleRender();
      fetchHotspotApi(serverUrl, { period: hotspotValue.period, granularity: hotspotValue.granularity, repo: getSelectedRepo() || undefined }, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted || destroyed) return;
          hotspotState.data = res;
          hotspotState.loading = false;
          scheduleRender();
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || destroyed) return;
          const err = e instanceof Error ? e : new Error(String(e));
          if (err.name === 'AbortError') return;
          hotspotState.loading = false;
          scheduleRender();
        });
    }, 300);
  }

  // ── Data fetch: DefectRisk ──
  function fetchDefectRisk(): void {
    if (destroyed) return;
    const { serverUrl } = props;
    if (!serverUrl) { defectRiskState.entries = []; scheduleRender(); return; }
    if (defectRiskState.timer !== null) clearTimeout(defectRiskState.timer);
    defectRiskState.controller?.abort();
    const ctrl = new AbortController();
    defectRiskState.controller = ctrl;
    defectRiskState.timer = setTimeout(() => {
      defectRiskState.loading = true;
      fetchDefectRiskApi(serverUrl, { windowDays: drWindowDays, halfLifeDays: 90, repo: getSelectedRepo() || undefined }, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted || destroyed) return;
          defectRiskState.entries = res.entries;
          defectRiskState.loading = false;
          scheduleRender();
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || destroyed) return;
          const err = e instanceof Error ? e : new Error(String(e));
          if (err.name === 'AbortError') return;
          defectRiskState.loading = false;
          scheduleRender();
        });
    }, 300);
  }

  // ── Data fetch: Temporal Coupling ──
  function fetchTC(): void {
    if (destroyed) return;
    const { serverUrl } = props;
    const selectedRepo = getSelectedRepo();
    if (!tcValue.enabled || !serverUrl || !selectedRepo) {
      tcState.edges = [];
      tcState.loading = false;
      scheduleRender();
      return;
    }
    if (tcState.timer !== null) clearTimeout(tcState.timer);
    tcState.controller?.abort();
    const ctrl = new AbortController();
    tcState.controller = ctrl;
    tcState.timer = setTimeout(() => {
      tcState.loading = true;
      fetchTemporalCouplingApi(serverUrl, {
        repoName: selectedRepo,
        windowDays: tcValue.windowDays,
        threshold: tcValue.threshold,
        topK: tcValue.topK,
        directional: false,
        granularity: tcValue.granularity,
      }, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted || destroyed) return;
          tcState.edges = res.edges;
          tcState.granularity = res.granularity ?? tcValue.granularity ?? 'commit';
          tcState.loading = false;
          scheduleRender();
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || destroyed) return;
          const err = e instanceof Error ? e : new Error(String(e));
          if (err.name === 'AbortError') return;
          tcState.loading = false;
          scheduleRender();
        });
    }, 300);
  }

  // ── Data fetch: ElementFunctions ──
  function fetchElementFunctions(): void {
    if (destroyed) return;
    const { serverUrl } = props;
    const elemId = (() => {
      if (!selectedElementId || !props.c4Model) return null;
      const elem = props.c4Model.elements.find(e => e.id === selectedElementId);
      if (!elem || elem.type !== 'code') return null;
      return selectedElementId;
    })();
    if (!elemId || !serverUrl) {
      elemFnsState.controller?.abort();
      elemFnsState.data = null;
      elemFnsState.loading = false;
      scheduleRender();
      return;
    }
    elemFnsState.controller?.abort();
    const ctrl = new AbortController();
    elemFnsState.controller = ctrl;
    elemFnsState.loading = true;
    fetchElementFunctionsApi(serverUrl, elemId, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted || destroyed) return;
        elemFnsState.data = res;
        elemFnsState.loading = false;
        scheduleRender();
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || destroyed) return;
        const err = e instanceof Error ? e : new Error(String(e));
        if (err.name === 'AbortError') return;
        elemFnsState.loading = false;
        scheduleRender();
      });
  }

  // ── Data fetch: FunctionGraph ──
  function fetchFunctionGraphData(): void {
    if (destroyed) return;
    const { serverUrl, c4Model } = props;
    if (currentLevel !== 5 || !selectedElementId || !c4Model || !serverUrl) {
      fnGraphState.controller?.abort();
      fnGraphState.data = null;
      fnGraphState.loading = false;
      fnGraphState.error = null;
      scheduleRender();
      return;
    }
    const elem = c4Model.elements.find(e => e.id === selectedElementId);
    if (!elem || (elem.type !== 'code' && elem.type !== 'component')) {
      fnGraphState.data = null;
      fnGraphState.loading = false;
      fnGraphState.error = null;
      scheduleRender();
      return;
    }
    fnGraphState.controller?.abort();
    const ctrl = new AbortController();
    fnGraphState.controller = ctrl;
    fnGraphState.loading = true;
    fnGraphState.error = null;
    fetchFunctionGraph(serverUrl, selectedElementId, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted || destroyed) return;
        fnGraphState.data = res;
        fnGraphState.loading = false;
        l5Viewport = { ...DEFAULT_VIEWPORT };
        scheduleRender();
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted || destroyed) return;
        const e = err instanceof Error ? err : new Error(String(err));
        if (e.name === 'AbortError') return;
        fnGraphState.error = e;
        fnGraphState.data = null;
        fnGraphState.loading = false;
        scheduleRender();
      });
  }

  // ── Data fetch: CodeGraph ──
  function fetchCodeGraph(): void {
    if (destroyed) return;
    const { serverUrl, selectedRelease, selectedRepo: selectedRepoProp } = props;
    const selectedRepo = selectedRepoProp ?? selectedRepoInternal;
    const enabled = showCommunity || codeGraphEnabled || currentLevel >= 2 || metricOverlay === 'architecture-layer';
    if (!enabled || !serverUrl) {
      codeGraphState.ws?.close();
      codeGraphState.ws = null;
      return;
    }
    codeGraphState.controller?.abort();
    const ctrl = new AbortController();
    codeGraphState.controller = ctrl;
    codeGraphState.loading = true;
    const params = new URLSearchParams();
    if (selectedRelease && selectedRelease !== CURRENT_RELEASE_TAG) params.set('release', selectedRelease);
    if (selectedRepo) params.set('repo', selectedRepo);
    const qs = params.toString();
    const url = `${serverUrl}/api/code-graph${qs ? `?${qs}` : ''}`;
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (ctrl.signal.aborted || destroyed) return;
        if (res.status === 404) { codeGraphState.graph = null; codeGraphState.loading = false; scheduleRender(); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as CodeGraph;
        codeGraphState.graph = data;
        codeGraphState.loading = false;
        scheduleRender();
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || destroyed) return;
        const err = e instanceof Error ? e : new Error(String(e));
        if (err.name === 'AbortError') return;
        codeGraphState.loading = false;
        scheduleRender();
      });

    // WebSocket subscription for code-graph-updated
    if (!codeGraphState.ws) {
      try {
        const WSCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
        if (WSCtor) {
          const wsUrl = serverUrl.replace(/^http/, 'ws');
          const ws = new WSCtor(wsUrl);
          codeGraphState.ws = ws;
          ws.addEventListener('message', (event: MessageEvent) => {
            if (destroyed) return;
            try {
              const msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data)) as { type?: string };
              if (msg.type === 'code-graph-updated') fetchCodeGraph();
            } catch { /* ignore */ }
          });
          ws.addEventListener('close', () => {
            if (codeGraphState.ws === ws) codeGraphState.ws = null;
          });
          ws.addEventListener('error', () => {
            if (codeGraphState.ws === ws) {
              codeGraphState.ws = null;
              try { ws.close(); } catch { /* ignore */ }
            }
          });
        }
      } catch { /* ignore */ }
    }
  }

  // ── Data fetch: Activity Trend ──
  function fetchActivityTrend(): void {
    if (destroyed) return;
    const { serverUrl } = props;
    const selectedRepo = getSelectedRepo();
    const elemId = selectedElementId;
    if (!elemId || !serverUrl || !showActivityTrend) {
      for (const c of trendDataState.controllers) c.abort();
      for (const t of trendDataState.timers) clearTimeout(t);
      trendDataState.controllers = [];
      trendDataState.timers = [];
      trendDataState.commit = null;
      trendDataState.read = null;
      trendDataState.write = null;
      trendDataState.defect = null;
      trendDataState.loading = false;
      scheduleRender();
      return;
    }
    for (const c of trendDataState.controllers) c.abort();
    for (const t of trendDataState.timers) clearTimeout(t);
    trendDataState.controllers = [];
    trendDataState.timers = [];
    trendDataState.loading = true;
    scheduleRender();

    const granularities: Array<{ key: 'commit' | 'read' | 'write' | 'defect'; granularity: 'commit' | 'session' | 'defect'; sessionMode?: 'read' | 'write' }> = [
      { key: 'commit', granularity: 'commit' },
      { key: 'read', granularity: 'session', sessionMode: 'read' },
      { key: 'write', granularity: 'session', sessionMode: 'write' },
      { key: 'defect', granularity: 'defect' },
    ];
    let pending = granularities.length;
    for (const spec_ of granularities) {
      const ctrl = new AbortController();
      trendDataState.controllers.push(ctrl);
      const timer = setTimeout(() => {
        fetchActivityTrendApi(serverUrl, {
          elementId: elemId,
          period: trendPeriod as import('@anytime-markdown/trail-core/c4').TrendPeriod,
          granularity: spec_.granularity as import('../../c4/hooks/fetchActivityTrendApi').ActivityTrendGranularity,
          sessionMode: spec_.sessionMode,
          repoName: selectedRepo || undefined,
        }, ctrl.signal)
          .then((res) => {
            if (ctrl.signal.aborted || destroyed) return;
            (trendDataState as unknown as Record<string, unknown>)[spec_.key] = res;
            pending--;
            if (pending <= 0) { trendDataState.loading = false; }
            scheduleRender();
          })
          .catch((e: unknown) => {
            if (ctrl.signal.aborted || destroyed) return;
            const err = e instanceof Error ? e : new Error(String(e));
            if (err.name === 'AbortError') return;
            pending--;
            if (pending <= 0) { trendDataState.loading = false; }
            scheduleRender();
          });
      }, 300);
      trendDataState.timers.push(timer);
    }
  }

  // ── Action handlers ──
  function handleSetLevel(level: number): void {
    pendingFitCount = 5;
    currentLevel = level;
    drillStack = [];
    checkedPackageIds = null;
    checkResetState = { key: checkResetState.key + 1, ids: null, expanded: null };
    dsmLevel = level <= 2 ? 'package' : 'component';
    if (level !== 5) { fnGraphState.data = null; fnGraphState.error = null; }
    scheduleRender();
    rebuildDocument();
    fetchCodeGraph();
    fetchFunctionGraphData();
  }

  function handleOverlayCategoryChange(cat: OverlayCategory): void {
    overlayCategory = cat;
    metricOverlay = cat === 'none' ? 'none' : OVERLAY_CATEGORY_DEFAULTS[cat];
    scheduleRender();
  }

  function handleClearFrameFilter(): void {
    soloFrameId = null;
    contextMenu = null;
    scheduleRender();
    rebuildDocument();
  }

  function handleCloseContextMenu(): void {
    contextMenu = null;
    scheduleRender();
  }

  function handleFit(): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = computeBounds(graphState_.document.nodes);
    const viewport = fitToContent(canvas.clientWidth, canvas.clientHeight, bounds);
    graphDispatch({ type: 'SET_VIEWPORT', viewport });
  }

  function handleDrillDown(c4Id: string): void {
    const { c4Model } = props;
    if (!c4Model) return;
    const element = c4Model.elements.find(e => e.id === c4Id);
    if (element) {
      const prevLevel = currentLevel;
      const minLevel = element.type === 'system' ? 2 : element.type === 'container' ? 3 : 4;
      drillStack = [...drillStack, { element, prevLevel, prevCheckedIds: checkedPackageIds }];
      if (currentLevel < minLevel) currentLevel = minLevel;
      checkedPackageIds = null;
      // 旧 handleDrillDown と同じく drill 起点+子孫の scope をチェック、祖先を展開する。
      const elementById = new Map(c4Model.elements.map(e => [e.id, e]));
      const inScope = new Set<string>();
      if (DRILL_SCOPE_TYPES.has(element.type as 'system')) inScope.add(element.id);
      for (const id of collectDescendantIds(c4Model.elements, element.id)) {
        const el = elementById.get(id);
        if (el && DRILL_SCOPE_TYPES.has(el.type as 'system')) inScope.add(id);
      }
      const expandIds = new Set<string>([element.id]);
      let parentId = element.boundaryId;
      while (parentId) {
        expandIds.add(parentId);
        parentId = elementById.get(parentId)?.boundaryId;
      }
      checkResetState = { key: checkResetState.key + 1, ids: inScope, expanded: expandIds };
    }
    selectedElementId = null;
    selectedElementIds = [];
    soloFrameId = null;
    contextMenu = null;
    scheduleRender();
    rebuildDocument();
  }

  function handleDrillUp(): void {
    const entry = drillStack.at(-1);
    if (entry?.prevLevel !== undefined) currentLevel = entry.prevLevel;
    if (entry) { pendingCenterC4Id = entry.element.id; pendingFitCount = 5; }
    drillStack = drillStack.slice(0, -1);
    checkedPackageIds = null;
    checkResetState = { key: checkResetState.key + 1, ids: entry?.prevCheckedIds ?? null, expanded: null };
    soloFrameId = null;
    contextMenu = null;
    scheduleRender();
    rebuildDocument();
  }

  function setShowCommunity(val: boolean): void {
    showCommunity = val;
    if (val) codeGraphEnabled = true;
    fetchCodeGraph();
    scheduleRender();
  }

  // ── Ghost edges (pure computation) ──
  function computeGhostEdges(): readonly C4GhostEdge[] {
    const { c4Model } = props;
    if (!c4Model || !tcValue.enabled) return [];
    return aggregateGhostEdgesToC4(tcState.edges, c4Model, currentLevel as 1 | 2 | 3 | 4, getSelectedRepo() || null);
  }

  // ── Shared metric sources (overlay 着色と選択要素 詳細パネルの双方で参照する) ──
  // 参照等価メモ化: overlay 着色と詳細パネルが同一レンダーで二重に呼んでも 1 回で済み、
  // 入力（props 行列・state データ）が不変な viewport 変更（pan/zoom）では再計算しない。
  const hotspotMapMemo = createRefMemo<HotspotMap | null>();
  const sizeMatrixMemo = createRefMemo<SizeMatrix | null>();
  const defectRiskMapMemo = createRefMemo<ReadonlyMap<string, number> | null>();

  function computeHotspotMapData(): HotspotMap | null {
    const { c4Model, complexityMatrix } = props;
    return hotspotMapMemo([c4Model, complexityMatrix, hotspotState.data], () => {
      if (!hotspotState.data || !c4Model) return null;
      const fileHotspots = computeFileHotspot(hotspotState.data.files);
      return aggregateHotspotToC4(fileHotspots, c4Model, complexityMatrix ?? null);
    });
  }

  function computeSizeMatrixData(): SizeMatrix | null {
    const { c4Model, fileAnalysisEntries } = props;
    return sizeMatrixMemo([c4Model, fileAnalysisEntries], () => {
      if (!fileAnalysisEntries?.length || !c4Model) return null;
      const sizeEntries = fileAnalysisEntries.filter(r => r.lineCount > 0).map(r => ({
        elementId: `file::${r.filePath}`, lineCount: r.lineCount, functionCount: r.functionCount,
      }));
      if (!sizeEntries.length) return null;
      return buildSizeMatrix(sizeEntries, c4Model.elements);
    });
  }

  function computeDefectRiskMapData(): ReadonlyMap<string, number> | null {
    const { c4Model } = props;
    return defectRiskMapMemo([c4Model, defectRiskState.entries], () => {
      if (!defectRiskState.entries.length || !c4Model) return null;
      const elementById = buildC4ElementById(c4Model.elements);
      const map = new Map<string, number>();
      for (const entry of defectRiskState.entries) {
        for (const m of mapFileToC4Elements(entry.filePath, elementById)) {
          map.set(m.elementId, Math.max(map.get(m.elementId) ?? 0, entry.score));
        }
      }
      return map;
    });
  }

  const layerMatrixMemo = createRefMemo<LayerMatrix | null>();
  function computeLayerMatrixData(): LayerMatrix | null {
    const { c4Model } = props;
    const graph = codeGraphState.graph;
    return layerMatrixMemo([c4Model, graph], () => {
      if (!graph || !c4Model) return null;
      const layerByPkg = new Map<string, ArchitectureLayer>();
      for (const n of graph.nodes) {
        if (n.layer) layerByPkg.set(n.package, n.layer);
      }
      if (layerByPkg.size === 0) return null;
      return buildLayerMatrix(c4Model.elements, layerByPkg);
    });
  }

  // 詳細パネル専用の重い算出（DSM 次数・情報パネル用 community overlay L3/L4）のメモ化。
  const dsmDegreeMemo = createRefMemo<ReturnType<typeof buildDsmDegreeMap>>();
  const communityOverlayL3Memo = createRefMemo<ReturnType<typeof computeCommunityOverlay> | null>();
  const communityOverlayL4Memo = createRefMemo<ReturnType<typeof computeCommunityOverlay> | null>();

  // ── Computed overlay maps ──
  function computeEffectiveOverlayMap(): ReadonlyMap<string, string> | null {
    const { c4Model, coverageMatrix, complexityMatrix, importanceMatrix, deadCodeMatrix, centralityMatrix, roleMatrix, dsmMatrix } = props;
    if (!c4Model) return null;
    const levelTargetType = getLevelTargetType();
    const elementTypeById = getElementTypeById();

    // filtered DSM
    let filteredDsm = dsmMatrix;
    if (filteredDsm && c4Model) {
      if (currentLevel === 1) filteredDsm = aggregateDsmToC4SystemLevel(filteredDsm, c4Model.elements);
      else if (currentLevel === 2) filteredDsm = aggregateDsmToC4ContainerLevel(filteredDsm, c4Model.elements);
      else if (currentLevel === 3) filteredDsm = aggregateDsmToC4ComponentLevel(filteredDsm, c4Model.elements);
      filteredDsm = sortDsmMatrixByName(filteredDsm);
      if (checkedPackageIds) filteredDsm = filterDsmMatrix(filteredDsm, checkedPackageIds);
    }

    const filterByLevel = <T>(obj: Record<string, T> | null | undefined): Record<string, T> | null => {
      if (!obj) return null;
      const out: Record<string, T> = {};
      for (const [id, v] of Object.entries(obj)) {
        if (elementTypeById.get(id) === levelTargetType) out[id] = v;
      }
      return out;
    };

    const filteredImportance = filterByLevel(importanceMatrix);
    const filteredCentrality = filterByLevel(centralityMatrix);
    const filteredDeadCode = filterByLevel(deadCodeMatrix);

    const filteredCoverage = (() => {
      if (!coverageMatrix) return null;
      const targetType = currentLevel === 2 ? 'container' : currentLevel === 3 ? 'component' : 'code';
      const typeById = new Map(c4Model.elements.map(e => [e.id, e.type]));
      return { ...coverageMatrix, entries: coverageMatrix.entries.filter(e => typeById.get(e.elementId) === targetType) };
    })();

    const filteredComplexity = (() => {
      if (!complexityMatrix) return null;
      return { ...complexityMatrix, entries: complexityMatrix.entries.filter(e => elementTypeById.get(e.elementId) === levelTargetType) };
    })();

    const filteredRole = (() => {
      if (!roleMatrix) return null;
      const out: RoleMatrix = {};
      for (const [id, entry] of Object.entries(roleMatrix)) {
        if (elementTypeById.get(id) === levelTargetType) out[id] = entry;
      }
      return out;
    })();

    // defect risk map
    const defectRiskMap = computeDefectRiskMapData();

    const filteredDefectRisk = (() => {
      if (!defectRiskMap) return null;
      const filtered = new Map<string, number>();
      for (const [id, score] of defectRiskMap) {
        if (elementTypeById.get(id) === levelTargetType) filtered.set(id, score);
      }
      return filtered;
    })();

    // hotspot map
    const hotspotMap = computeHotspotMapData();

    const filteredHotspot = (() => {
      if (!hotspotMap) return null;
      const filtered = new Map<string, ReturnType<HotspotMap['get']> & object>();
      for (const [id, entry] of hotspotMap) {
        if (entry && elementTypeById.get(id) === levelTargetType) filtered.set(id, entry);
      }
      return filtered;
    })();

    // size matrix
    const sizeMatrix_ = computeSizeMatrixData();

    const filteredSize = (() => {
      if (!sizeMatrix_) return null;
      const out: SizeMatrix = {};
      for (const [id, entry] of Object.entries(sizeMatrix_)) {
        if (elementTypeById.get(id) === levelTargetType) out[id] = entry;
      }
      return out;
    })();

    // architecture matrix
    const archMatrix = (() => {
      const { fileAnalysisEntries } = props;
      if (!fileAnalysisEntries?.length || !c4Model) return null;
      const archEntries: ArchitectureFileEntry[] = fileAnalysisEntries.map(r => ({
        elementId: `file::${r.filePath}`, category: r.category ?? 'logic',
      }));
      return buildArchitectureMatrix(archEntries, c4Model.elements);
    })();

    const filteredArch = (() => {
      if (!archMatrix) return null;
      const out: ArchitectureMatrix = {};
      for (const [id, entry] of Object.entries(archMatrix)) {
        if (elementTypeById.get(id) === levelTargetType) out[id] = entry;
      }
      return out;
    })();

    // layer matrix（code graph ノードの package/layer を C4 要素へ集約）
    const layerMatrix_ = computeLayerMatrixData();

    const filteredLayer = (() => {
      if (!layerMatrix_) return null;
      const out: LayerMatrix = {};
      for (const [id, layer] of Object.entries(layerMatrix_)) {
        if (elementTypeById.get(id) === levelTargetType) out[id] = layer;
      }
      return out;
    })();

    const map = computeColorMap(
      metricOverlay,
      filteredCoverage,
      filteredDsm,
      filteredComplexity,
      filteredImportance,
      filteredDefectRisk,
      filteredHotspot,
      filteredDeadCode,
      filteredSize,
      filteredCentrality,
      filteredArch,
      filteredRole,
      filteredLayer,
      getC4Colors(props.isDark ?? false).layerColors,
    );
    return map.size > 0 ? map : null;
  }

  function computeClaudeActivityColorMapWrapped(): ReadonlyMap<string, string> | null {
    const { claudeActivity, multiAgentActivity, c4Model } = props;
    const isDark = props.isDark ?? false;
    const elementTypeById = getElementTypeById();
    const levelTargetType = getLevelTargetType();

    if (multiAgentActivity && multiAgentActivity.agents.length > 0) {
      const agentsForLevel = multiAgentActivity.agents.map(agent => ({
        ...agent,
        activeElementIds: agent.activeElementIds.filter(id => elementTypeById.get(id) === levelTargetType),
        touchedElementIds: agent.touchedElementIds.filter(id => elementTypeById.get(id) === levelTargetType),
        plannedElementIds: agent.plannedElementIds.filter(id => elementTypeById.get(id) === levelTargetType),
      }));
      const hasAny = agentsForLevel.some(a => a.activeElementIds.length > 0 || a.touchedElementIds.length > 0 || a.plannedElementIds.length > 0);
      if (!hasAny) return null;
      return computeMultiAgentColorMap(agentsForLevel, isDark);
    }

    if (!claudeActivity) return null;
    const { activeElementIds, touchedElementIds, plannedElementIds } = claudeActivity;
    if (activeElementIds.length === 0 && touchedElementIds.length === 0 && plannedElementIds.length === 0) return null;
    if (c4Model) {
      const fa = activeElementIds.filter(id => elementTypeById.get(id) === levelTargetType);
      const ft = touchedElementIds.filter(id => elementTypeById.get(id) === levelTargetType);
      const fp = plannedElementIds.filter(id => elementTypeById.get(id) === levelTargetType);
      if (!fa.length && !ft.length && !fp.length) return null;
      return computeClaudeActivityColorMap(fa, ft, fp, isDark);
    }
    return computeClaudeActivityColorMap(activeElementIds, touchedElementIds, plannedElementIds, isDark);
  }

  function computeConflictBorderMapWrapped(): ReadonlyMap<string, string> | null {
    const { multiAgentActivity, c4Model } = props;
    if (!multiAgentActivity?.conflicts?.length) return null;
    const elementTypeById = getElementTypeById();
    const levelTargetType = getLevelTargetType();
    if (!c4Model) return computeConflictBorderMap(multiAgentActivity.conflicts);
    const filtered = multiAgentActivity.conflicts.map(c => ({
      ...c, elementIds: c.elementIds.filter(id => elementTypeById.get(id) === levelTargetType),
    })).filter(c => c.elementIds.length > 0);
    if (!filtered.length) return null;
    return computeConflictBorderMap(filtered);
  }

  function computeCommunityMapWrapped(communityOverlay: ReadonlyMap<string, CommunityOverlayEntry> | null, selectedCommunityInfo: { cid: number } | null): ReadonlyMap<string, { color: string; isGodNode: boolean }> | null {
    if (!communityOverlay) return null;
    const filterCid = selectedCommunityInfo?.cid ?? null;
    const map = new Map<string, { color: string; isGodNode: boolean }>();
    for (const [elementId, entry] of communityOverlay) {
      if (filterCid !== null && entry.dominantCommunity !== filterCid) continue;
      map.set(elementId, { color: communityColor(entry.dominantCommunity), isGodNode: entry.isGodNode });
    }
    return map.size > 0 ? map : null;
  }

  // ── Main render ──
  function render(): void {
    if (destroyed) return;
    const colors = getColors();
    const { c4Model, boundaries: boundaryInfos, t } = props;
    const isDark = props.isDark ?? false;
    const selectedRepo = getSelectedRepo();

    // Update root background
    root.style.background = colors.bg;
    root.style.height = props.containerHeight ?? '100vh';

    // Update loading overlay
    if (props.analysisProgress) {
      loadingOverlay.style.display = 'flex';
      loadingCard.style.cssText = `background:${colors.bgSecondary};border:1px solid ${colors.border};border-radius:8px;padding:24px 32px;min-width:360px;max-width:480px;text-align:center;`;
      loadingTitle.style.color = colors.text;
      loadingPhase.textContent = props.analysisProgress.phase;
      loadingPhase.style.color = colors.textSecondary;
      loadingProgress.style.background = colors.hover;
      const pct = props.analysisProgress.percent;
      if (pct >= 0) { loadingBar.style.width = `${pct}%`; loadingPct.textContent = `${pct}%`; }
      else { loadingBar.style.width = '100%'; loadingPct.textContent = ''; }
    } else {
      loadingOverlay.style.display = 'none';
    }

    // Update colors on controls
    controlsBox.style.cssText = `width:220px;border:1px solid ${colors.border};border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:${colors.popupBg};backdrop-filter:blur(10px);box-shadow:${POPUP_SHADOW};`;
    sep.style.borderColor = colors.border;
    levelLabel.style.color = colors.textMuted;
    overlayLabel.textContent = t('c4.overlay.label');
    overlayLabel.style.color = colors.textMuted;
    overlaySelect.style.background = colors.bgSecondary;
    overlaySelect.style.color = colors.text;
    overlaySelect.style.borderColor = colors.border;
    overlaySubSelect.style.background = colors.bgSecondary;
    overlaySubSelect.style.color = colors.text;
    overlaySubSelect.style.borderColor = colors.border;

    // Level buttons
    for (let i = 0; i < levelBtns.length; i++) {
      const active = currentLevel === (i + 1);
      levelBtns[i].setAttribute('aria-pressed', String(active));
      levelBtns[i].style.cssText = active
        ? `flex:1;padding:2px 0;font-size:0.75rem;font-weight:600;border-radius:4px;cursor:pointer;border:1px solid ${colors.accent};background:${colors.accent};color:${isDark ? colors.bg : '#fff'};`
        : `flex:1;padding:2px 0;font-size:0.75rem;font-weight:600;border-radius:4px;cursor:pointer;border:1px solid ${colors.border};background:transparent;color:${colors.textSecondary};`;
    }

    // Toggle buttons styling
    const btnStyle = (active: boolean, disabled = false) =>
      `padding:3px;border-radius:4px;cursor:${disabled ? 'default' : 'pointer'};display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;background:${active ? colors.focus : 'transparent'};color:${disabled ? colors.textMuted : colors.accent};`;

    // Community: 無効条件は「C3 未満」または「有効なのにコードグラフ未取得」（旧と一致）。
    // 状態別ツールチップ（レベル不足 / データ未取得 / 通常）と aria-pressed を i18n で復元。
    const communityDisabled = currentLevel < 3 || (showCommunity && !codeGraphState.graph);
    communityBtn.style.cssText = btnStyle(showCommunity && currentLevel >= 3, communityDisabled);
    communityBtn.disabled = communityDisabled;
    communityBtn.title = currentLevel < 3
      ? t('c4.community.disabledLevel')
      : (showCommunity && !codeGraphState.graph)
        ? t('c4.community.disabledNoData')
        : t('c4.community.toggle');
    communityBtn.setAttribute('aria-label', t('c4.community.toggle'));
    communityBtn.setAttribute('aria-pressed', String(showCommunity && currentLevel >= 3));
    ghostEdgeBtn.style.cssText = btnStyle(tcValue.enabled);
    ghostEdgeBtn.setAttribute('aria-pressed', String(tcValue.enabled));
    trendBtn.style.cssText = btnStyle(showActivityTrend);
    trendBtn.setAttribute('aria-pressed', String(showActivityTrend));
    upperLinesBtn.style.cssText = btnStyle(showAncestorEdges && currentLevel !== 1, currentLevel === 1);
    upperLinesBtn.disabled = currentLevel === 1;
    upperLinesBtn.setAttribute('aria-pressed', String(showAncestorEdges && currentLevel !== 1));
    const hasClaudeActivity = !!(props.claudeActivity && (props.claudeActivity.activeElementIds.length > 0 || props.claudeActivity.touchedElementIds.length > 0 || props.claudeActivity.plannedElementIds.length > 0)) || !!(props.multiAgentActivity?.agents.length);
    clearHistoryBtn.disabled = !hasClaudeActivity;
    clearHistoryBtn.style.cssText = btnStyle(false, !hasClaudeActivity);
    clearHistoryBtn.title = t('c4.claudeActivity.reset');
    clearHistoryBtn.setAttribute('aria-label', t('c4.claudeActivity.reset'));

    graphPopupBtn.style.cssText = btnStyle(showGraphPopup);
    graphPopupBtn.setAttribute('aria-pressed', String(showGraphPopup));
    graphPopupBtn.setAttribute('aria-label', t('c4.graph.title'));
    matrixPopupBtn.style.cssText = btnStyle(!!matrixPopup);
    matrixPopupBtn.setAttribute('aria-pressed', String(!!matrixPopup));
    matrixPopupBtn.setAttribute('aria-label', t('c4.matrix.title'));
    scatterPopupBtn.style.cssText = btnStyle(!!scatterPopup);
    scatterPopupBtn.setAttribute('aria-pressed', String(!!scatterPopup));
    scatterPopupBtn.setAttribute('aria-label', t('c4.scatter.title'));

    // Frame filter button
    if (soloFrameId !== null) {
      frameFilterBtn.style.display = 'block';
      frameFilterBtn.style.color = colors.accent;
      const txt = frameFilterBtn.childNodes[1];
      if (txt) (txt as Text).textContent = ` ${t('c4.frameFilter.reset')}`;
    } else {
      frameFilterBtn.style.display = 'none';
    }

    // Multi-agent badge（エージェント数 + 衝突件数）。旧はエージェント数に加え conflicts>0 で
    // 衝突件数を赤太字で併記していた。conflicts バッジ復元。
    if (props.multiAgentActivity && props.multiAgentActivity.agents.length > 1) {
      multiAgentBadge.style.display = 'block';
      multiAgentBadge.style.color = colors.textSecondary;
      const agentSpan = document.createElement('span');
      agentSpan.textContent = `${props.multiAgentActivity.agents.length} ${t('c4.multiAgent.badge')}`;
      const conflicts = props.multiAgentActivity.conflicts;
      if (conflicts && conflicts.length > 0) {
        const conflictSpan = document.createElement('span');
        conflictSpan.style.cssText = `margin-left:6px;color:${colors.cycleBorder};font-weight:700;`;
        conflictSpan.textContent = `${conflicts.length} ${t('c4.multiAgent.conflicts')}`;
        multiAgentBadge.replaceChildren(agentSpan, conflictSpan);
      } else {
        multiAgentBadge.replaceChildren(agentSpan);
      }
    } else {
      multiAgentBadge.style.display = 'none';
    }

    // Overlay selects
    updateOverlaySelects(colors);

    // Computed community overlay
    const communityOverlay = (() => {
      if (!showCommunity || !codeGraphState.graph || !c4Model) return null;
      if (currentLevel !== 3 && currentLevel !== 4) return null;
      return computeCommunityOverlay(c4Model, codeGraphState.graph, currentLevel as 3 | 4, selectedRepo || null);
    })();

    // selectedCommunityInfo
    const selectedCommunityInfo = (() => {
      if (!selectedElementId?.startsWith('community:')) return null;
      const cid = Number.parseInt(selectedElementId.slice('community:'.length), 10);
      if (Number.isNaN(cid)) return null;
      const communityOverlayL3 = (() => {
        if (!codeGraphState.graph || !c4Model) return null;
        if (currentLevel === 1) return null;
        return computeCommunityOverlay(c4Model, codeGraphState.graph, 3, selectedRepo || null);
      })();
      const communityTree_ = (() => {
        if (!communityOverlayL3 || !codeGraphState.graph || !c4Model) return undefined;
        const maxDepth = currentLevel === 2 ? 'container' : currentLevel === 3 ? 'component' : 'code';
        return buildCommunityTree({ c4Model, communityOverlay: communityOverlayL3, communities: codeGraphState.graph.communities, communitySummaries: codeGraphState.graph.communitySummaries, maxDepth });
      })();
      const node = communityTree_?.find(n => n.communityId === cid) ?? null;
      if (!node) return null;
      const summary = codeGraphState.graph?.communitySummaries?.[cid];
      const fallbackLabel = codeGraphState.graph?.communities[cid];
      return {
        cid,
        displayName: summary?.name ?? fallbackLabel ?? `#${cid}`,
        color: communityColor(cid),
        nodeCount: node.nodeCount ?? 0,
        summaryText: summary?.summary ?? node.description,
        children: [...node.children] as Array<{ id: string; name: string }>,
      };
    })();

    // 選択要素（非コミュニティ）の詳細メトリクス（DSM / Metrics / Community セクション用）。
    // 情報パネル用 community オーバーレイは showCommunity トグルと独立に L3/L4 を解決する。
    const selectedElementDetail = (() => {
      if (!selectedElementId || selectedElementId.startsWith('community:') || !c4Model) return null;
      const element = c4Model.elements.find(e => e.id === selectedElementId);
      if (!element) return null;
      const graph = codeGraphState.graph;
      const overlayForInfo = (level: 3 | 4, memo: typeof communityOverlayL3Memo) =>
        memo([graph, c4Model, currentLevel, selectedRepo], () =>
          (graph && currentLevel !== 1) ? computeCommunityOverlay(c4Model, graph, level, selectedRepo || null) : null);
      return buildSelectedElementInfo({
        element,
        c4Model,
        dsmDegreeMap: dsmDegreeMemo([props.dsmMatrix, c4Model.elements], () => buildDsmDegreeMap(props.dsmMatrix ?? null, c4Model.elements)),
        coverageMatrix: props.coverageMatrix ?? null,
        complexityMatrix: props.complexityMatrix ?? null,
        importanceMatrix: props.importanceMatrix ?? null,
        defectRiskMap: computeDefectRiskMapData(),
        hotspotMap: computeHotspotMapData(),
        sizeMatrix: computeSizeMatrixData(),
        layerMatrix: computeLayerMatrixData(),
        communityOverlayL3: overlayForInfo(3, communityOverlayL3Memo),
        communityOverlayL4: overlayForInfo(4, communityOverlayL4Memo),
        communitySummaries: graph?.communitySummaries,
      });
    })();

    // Update graph canvas
    if (currentLevel === 5) {
      // L5 mode
      l5Placeholder.style.display = 'flex';
      const { c4Model: cm } = props;
      const selectedCodeElementId = (() => {
        if (!selectedElementId || !cm) return '';
        const elem = cm.elements.find(e => e.id === selectedElementId);
        if (!elem) return '';
        return (elem.type === 'code' || elem.type === 'component') ? elem.id : '';
      })();
      if (!selectedCodeElementId) {
        l5Placeholder.textContent = t('c4.level.L5.emptySelection');
        l5Placeholder.style.color = colors.textSecondary;
        // destroy main graph canvas if visible
        if (graphCanvasHandle) { graphCanvasHandle.destroy(); graphCanvasHandle = null; }
      } else if (fnGraphState.loading) {
        l5Placeholder.textContent = t('viewer.loading');
        l5Placeholder.style.color = colors.textSecondary;
        if (graphCanvasHandle) { graphCanvasHandle.destroy(); graphCanvasHandle = null; }
      } else if (fnGraphState.error) {
        l5Placeholder.textContent = t('c4.level.L5.error');
        l5Placeholder.style.color = '#F44336';
        if (graphCanvasHandle) { graphCanvasHandle.destroy(); graphCanvasHandle = null; }
      } else if (fnGraphState.data && fnGraphState.data.nodes.length === 0) {
        l5Placeholder.textContent = t('c4.level.L5.emptyNoFunctions');
        l5Placeholder.style.color = colors.textSecondary;
        if (graphCanvasHandle) { graphCanvasHandle.destroy(); graphCanvasHandle = null; }
      } else if (fnGraphState.data) {
        l5Placeholder.style.display = 'none';
        const l5Doc = buildFunctionGraphDocument(fnGraphState.data, isDark);
        if (!graphCanvasHandle) {
          graphCanvasHandle = mountGraphCanvas(graphCanvasArea, {
            document: l5Doc, viewport: l5Viewport,
            dispatch: (action) => { if (action.type === 'SET_VIEWPORT') { l5Viewport = action.viewport; scheduleRender(); } },
            onCanvasReady: (el) => { canvasRef.current = el; },
            isDark,
          });
        } else {
          graphCanvasHandle.update({ document: l5Doc, viewport: l5Viewport, dispatch: (action) => { if (action.type === 'SET_VIEWPORT') { l5Viewport = action.viewport; scheduleRender(); } }, isDark });
        }
      } else {
        l5Placeholder.textContent = t('c4.level.L5.emptySelection');
        l5Placeholder.style.color = colors.textSecondary;
        if (graphCanvasHandle) { graphCanvasHandle.destroy(); graphCanvasHandle = null; }
      }
    } else {
      l5Placeholder.style.display = 'none';

      // Community map
      const communityMap = computeCommunityMapWrapped(communityOverlay, selectedCommunityInfo);

      // Activity map
      const claudeActivityMap = computeClaudeActivityColorMapWrapped();
      const conflictBorderMap = computeConflictBorderMapWrapped();
      const claudeActivityMapWithConflicts = (() => {
        if (!claudeActivityMap && !conflictBorderMap) return null;
        const map = new Map(claudeActivityMap ?? []);
        if (conflictBorderMap) for (const [id, color] of conflictBorderMap) map.set(id, color);
        return map.size > 0 ? map : null;
      })();

      // Overlay map
      const effectiveOverlayMap = computeEffectiveOverlayMap();

      // Ghost edges
      const ghostEdges_ = computeGhostEdges();

      // Selected node in graph doc
      const selectedNodeId = selectedElementId
        ? (graphState_.document.nodes.find(n => n.metadata?.c4Id === selectedElementId)?.id ?? null)
        : null;

      const communityRoleBadgeMap = (() => {
        if (!communityOverlay || !props.featureMatrix) return null;
        const filterCid = selectedCommunityInfo?.cid ?? null;
        const map = new Map<string, string>();
        for (const [elementId, entry] of communityOverlay) {
          if (filterCid !== null && entry.dominantCommunity !== filterCid) continue;
          const featureId = `f_community_${entry.dominantCommunity}`;
          const role = props.featureMatrix.mappings.find(m => m.featureId === featureId && m.elementId === elementId)?.role ?? null;
          if (role) map.set(elementId, COMMUNITY_ROLE_LABELS[role as keyof typeof COMMUNITY_ROLE_LABELS] ?? role);
        }
        return map.size > 0 ? map : null;
      })();

      const gcProps = {
        document: graphState_.document,
        viewport: graphState_.document.viewport,
        dispatch: graphDispatch,
        onCanvasReady: (el: HTMLCanvasElement) => { canvasRef.current = el; },
        canvasRef,
        selectedNodeId,
        centerOnSelect,
        overlayMap: effectiveOverlayMap,
        claudeActivityMap: claudeActivityMapWithConflicts,
        communityMap,
        communityRoleBadgeMap,
        ghostEdges: tcValue.enabled && (currentLevel === 3 || currentLevel === 4) ? ghostEdges_.map(e => ({ source: e.source, target: e.target, jaccard: e.jaccard, direction: e.direction, confidenceForward: e.confidenceForward })) : undefined,
        ghostEdgeGranularity: tcState.granularity,
        onNodeSelect: (id: string | null) => { centerOnSelect = false; selectedElementId = id; selectedElementIds = []; scheduleRender(); fetchElementFunctions(); },
        onMultiNodeSelect: (ids: readonly string[]) => {
          if (ids.length === 1) { selectedElementId = ids[0]; selectedElementIds = []; }
          else if (ids.length === 0) { selectedElementId = null; selectedElementIds = []; }
          else { selectedElementId = null; selectedElementIds = ids; }
          scheduleRender();
        },
        onNodeDoubleClick: (nodeId: string) => {
          if (!props.c4Model) return;
          const elem = props.c4Model.elements.find(e => e.id === nodeId);
          const editableTypes: readonly string[] = ['person', 'system', 'container', 'component'];
          if (elem?.manual && editableTypes.includes(elem.type)) {
            // 旧 C4ViewerCore の onNodeDoubleClick と同じく manual 要素を編集モードで開く。
            editElementId = elem.id;
            addElementDialogType = elem.type as 'person' | 'system' | 'container' | 'component';
            addElementDialogOpen = true;
            scheduleRender();
          }
        },
        onNodeContextMenu: (c4Id: string, x: number, y: number) => { contextMenu = { x, y, c4Id }; scheduleRender(); },
        isDark,
      };

      if (!graphCanvasHandle) {
        graphCanvasHandle = mountGraphCanvas(graphCanvasArea, gcProps);
      } else {
        graphCanvasHandle.update(gcProps);
      }
    }

    // Minimap
    if (!minimapHandle) {
      minimapHandle = mountMinimapCanvas(minimapHost, {
        nodes: currentLevel === 5 ? [] : graphState_.document.nodes,
        viewport: currentLevel === 5 ? l5Viewport : graphState_.document.viewport,
        mainCanvasRef: canvasRef,
        onViewportChange: (vp) => {
          if (currentLevel === 5) { l5Viewport = vp; } else { graphDispatch({ type: 'SET_VIEWPORT', viewport: vp }); }
        },
        isDark,
        onFit: handleFit,
        width: 220,
        height: 130,
      });
    } else {
      minimapHandle.update({
        nodes: currentLevel === 5 ? [] : graphState_.document.nodes,
        viewport: currentLevel === 5 ? l5Viewport : graphState_.document.viewport,
        mainCanvasRef: canvasRef,
        onViewportChange: (vp) => {
          if (currentLevel === 5) { l5Viewport = vp; } else { graphDispatch({ type: 'SET_VIEWPORT', viewport: vp }); }
        },
        isDark,
        onFit: handleFit,
        width: 220,
        height: 130,
      });
    }

    // ── Tree (left panel) ──
    const elementTree = props.c4Model
      ? filterTreeByLevel(buildElementTree(props.c4Model, props.boundaries ?? []), currentLevel)
      : [];
    const communityTree_ = (() => {
      if (!showCommunity || !codeGraphState.graph || !props.c4Model) return undefined;
      const communityOverlayL3 = (() => {
        if (!codeGraphState.graph || !props.c4Model) return null;
        return computeCommunityOverlay(props.c4Model, codeGraphState.graph, 3, getSelectedRepo() || null);
      })();
      if (!communityOverlayL3) return undefined;
      const maxDepth = currentLevel === 2 ? 'container' as const : currentLevel === 3 ? 'component' as const : 'code' as const;
      return buildCommunityTree({ c4Model: props.c4Model, communityOverlay: communityOverlayL3, communities: codeGraphState.graph.communities, communitySummaries: codeGraphState.graph.communitySummaries, maxDepth });
    })();
    const repoOptions_ = getRepoOptions();
    const treeProps: C4ElementTreeVanillaProps = {
      tree: elementTree,
      dispatch: graphDispatch,
      onSelect: (id: string) => {
        selectedElementId = id;
        selectedElementIds = [];
        centerOnSelect = true;
        scheduleRender();
        fetchElementFunctions();
      },
      repoOptions: repoOptions_,
      selectedRepo: getSelectedRepo() || undefined,
      onRepoChange: (repo: string) => { selectedRepoInternal = repo; props.onRepoSelect?.(repo); scheduleRender(); fetchHotspot(); fetchDefectRisk(); fetchTC(); fetchCodeGraph(); fetchActivityTrend(); },
      releaseOptions: props.releases ?? [],
      selectedRelease: props.selectedRelease,
      onReleaseChange: props.onReleaseSelect,
      currentLevel,
      selectedSystemId: selectedElementId,
      onAddElement: (type: 'person' | 'system' | 'container' | 'component') => {
        editElementId = null;
        addElementDialogType = type;
        addElementDialogOpen = true;
        scheduleRender();
      },
      onCheckedChange: (ids: ReadonlySet<string>) => {
        checkedPackageIds = ids;
        scheduleRender();
        rebuildDocument();
      },
      onRemoveElement: props.onRemoveElement,
      onPurgeDeleted: props.onPurgeDeleted,
      isDark,
      checkReset: checkResetState,
      communityTree: communityTree_,
      communityLoading: codeGraphState.loading,
      onCommunityTabOpen: () => { setShowCommunity(true); },
      colors: {
        bg: colors.bg,
        bgSecondary: colors.bgSecondary,
        border: colors.border,
        accent: colors.accent,
        hover: colors.hover,
        text: colors.text,
        textMuted: colors.textMuted,
        textSecondary: colors.textSecondary,
        selected: colors.focus,
      },
      t: props.t,
    };
    if (!treeHandle) {
      treeHandle = mountC4ElementTree(treeHost, treeProps);
    } else {
      treeHandle.update(treeProps);
    }

    // ── Overlay controls (conditionally mounted in graphCanvasArea) ──
    const showHotspot = overlayCategory === 'hotspot';
    const showDefectRisk = overlayCategory === 'importance' && (metricOverlay === 'defect-risk' || metricOverlay === 'importance');
    const showTC = tcValue.enabled && (currentLevel === 3 || currentLevel === 4);

    if (showHotspot) {
      const hcProps: HotspotControlsVanillaProps = {
        value: hotspotValue,
        onChange: (next) => { hotspotValue = next; scheduleRender(); fetchHotspot(); },
        loading: hotspotState.loading,
        isDark,
        enabled: showHotspot,
        labelPeriod: props.t('c4.hotspot.controls.period'),
        labelGranularity: props.t('c4.hotspot.controls.granularity'),
        labelGranularityCommit: props.t('c4.hotspot.controls.granularityCommit'),
        labelGranularitySession: props.t('c4.hotspot.controls.granularitySession'),
        // leftPanel の列に inline 配置（floating だと leftPanel と座標衝突）
        variant: 'inline',
      };
      if (!hotspotControlsHandle) {
        hotspotControlsHandle = mountHotspotControls(leftPanel, hcProps);
      } else {
        hotspotControlsHandle.update(hcProps);
      }
    } else if (hotspotControlsHandle) {
      hotspotControlsHandle.destroy();
      hotspotControlsHandle = null;
    }

    if (showDefectRisk) {
      const drProps: DefectRiskControlsVanillaProps = {
        value: defectRiskValue,
        onChange: (next) => { defectRiskValue = next; drWindowDays = next.windowDays; scheduleRender(); fetchDefectRisk(); },
        resultCount: defectRiskState.entries.length,
        loading: defectRiskState.loading,
        labelWindow: props.t('c4.defectRisk.window'),
        labelHalfLife: props.t('c4.defectRisk.halfLife'),
        labelCalculating: props.t('c4.defectRisk.calculating'),
        labelOff: props.t('c4.defectRisk.off'),
        isDark,
        // 左パネル列に縦カードとして表示（旧: graphCanvasArea フロー追加で不可視だった）
        variant: 'inline',
      };
      if (!defectRiskControlsHandle) {
        defectRiskControlsHandle = mountDefectRiskControls(leftPanel, drProps);
      } else {
        defectRiskControlsHandle.update(drProps);
      }
    } else if (defectRiskControlsHandle) {
      defectRiskControlsHandle.destroy();
      defectRiskControlsHandle = null;
    }

    if (showTC) {
      // Ghost Edges 詳細コントロールを左パネル列に縦カードとして表示（設定ポップアップは廃止し本 controls に一本化）
      const tcProps: TemporalCouplingControlsVanillaProps = {
        value: tcValue,
        onChange: (next) => { tcValue = next; scheduleRender(); fetchTC(); },
        resultCount: (tcState.edges as unknown[]).length,
        loading: tcState.loading,
        isDark,
        variant: 'inline',
      };
      if (!tcControlsHandle) {
        tcControlsHandle = mountTemporalCouplingControls(leftPanel, tcProps);
      } else {
        tcControlsHandle.update(tcProps);
      }
    } else if (tcControlsHandle) {
      tcControlsHandle.destroy();
      tcControlsHandle = null;
    }

    // ── Overlay legend ──
    if (metricOverlay !== 'none' || (showCommunity && communityOverlay)) {
      const dsmMax = (() => {
        if (!props.dsmMatrix) return undefined;
        let max = 0;
        for (const row of props.dsmMatrix.adjacency) {
          for (const v of row) { if (typeof v === 'number' && v > max) max = v; }
        }
        return max > 0 ? max : undefined;
      })();
      const legendCommunity = (() => {
        if (!communityOverlay || !codeGraphState.graph) return undefined;
        const seen = new Set<number>();
        const items: Array<{ community: number; color: string; name: string; summary?: string }> = [];
        for (const [, entry] of communityOverlay) {
          const cid = entry.dominantCommunity;
          if (!seen.has(cid)) {
            seen.add(cid);
            const summary = codeGraphState.graph.communitySummaries?.[cid];
            items.push({ community: cid, color: communityColor(cid), name: summary?.name ?? codeGraphState.graph.communities[cid] ?? `#${cid}`, summary: summary?.summary });
          }
        }
        items.sort((a, b) => a.community - b.community);
        return items.slice(0, 20);
      })();
      const legendProps: OverlayLegendVanillaProps = {
        overlay: metricOverlay,
        isDark,
        dsmMax,
        communityLegend: legendCommunity,
        communityTitle: props.t('c4.community.title'),
        t: props.t,
        textColor: colors.overlayLegendText,
        bg: colors.overlayLegendBg,
        dividerColor: colors.border,
        // 右下フロートではなく左パネル列の下に積む（inline = position:static）
        inline: true,
      };
      if (!overlayLegendHandle) {
        overlayLegendHandle = mountOverlayLegend(leftPanel, legendProps);
      } else {
        overlayLegendHandle.update(legendProps);
      }
    } else if (overlayLegendHandle) {
      overlayLegendHandle.destroy();
      overlayLegendHandle = null;
    }

    // ── Activity Trend Panel ──
    if (showActivityTrend && selectedElementId) {
      const palette = isDark ? ACTIVITY_TREND_COLORS.dark : ACTIVITY_TREND_COLORS.light;
      const trendSeries = buildActivityTrendSeries(
        trendDataState.commit,
        trendDataState.read,
        trendDataState.write,
        trendDataState.defect,
        {
          commit: props.t('c4.trend.seriesCommit'),
          read: props.t('c4.trend.seriesRead'),
          write: props.t('c4.trend.seriesWrite'),
          defect: props.t('c4.trend.seriesDefect'),
        },
        palette,
      );
      const spec_: ChartSpec | null = (() => {
        if (!trendSeries) return null;
        const series: Series[] = trendSeries.series.map((s) => ({
          name: s.label,
          type: s.kind,
          color: s.color,
          axis: s.yAxisId,
          values: [...s.data],
        }));
        return {
          kind: 'combo',
          categories: trendSeries.xs.map((d) => {
            const parsed = new Date(`${d}T00:00:00Z`);
            if (Number.isNaN(parsed.getTime())) return d;
            return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(parsed);
          }),
          series,
          options: { legend: 'none' },
        } as ChartSpec;
      })();
      const trendProps: ActivityTrendPanelProps = {
        elementId: selectedElementId,
        period: trendPeriod,
        onPeriodChange: (p: string) => { trendPeriod = p; scheduleRender(); fetchActivityTrend(); },
        spec: spec_,
        legendItems: trendSeries?.series.map((s) => ({ label: s.label, color: s.color })) ?? [],
        loading: trendDataState.loading,
        error: null,
        isDark,
        t: props.t,
      };
      if (!trendPanelHandle) {
        trendPanelHandle = mountActivityTrendPanel(trendPanel, trendProps);
      } else {
        trendPanelHandle.update(trendProps);
      }
    } else {
      if (trendPanelHandle) { trendPanelHandle.destroy(); trendPanelHandle = null; }
    }

    // ── Dead Code Detail (appended into elemInfoPanel for code elements) ──
    if (selectedElementId && props.c4Model) {
      const elem = props.c4Model.elements.find(e => e.id === selectedElementId);
      if (elem?.type === 'code' && props.fileAnalysisEntries && props.fileAnalysisEntries.length > 0) {
        const deadCodeProps: DeadCodeDetailPanelProps = {
          entries: props.fileAnalysisEntries,
          t: props.t,
          colors: {
            border: colors.border,
            text: colors.text,
            textSecondary: colors.textSecondary,
            textMuted: colors.textMuted,
          },
          onFileOpen: props.onOpenFile,
        };
        if (!deadCodeHandle) {
          deadCodeHandle = mountDeadCodeDetailPanel(elemInfoPanel, deadCodeProps);
        } else {
          deadCodeHandle.update(deadCodeProps);
        }
      } else {
        if (deadCodeHandle) { deadCodeHandle.destroy(); deadCodeHandle = null; }
      }
    } else {
      if (deadCodeHandle) { deadCodeHandle.destroy(); deadCodeHandle = null; }
    }

    // ── Call Hierarchy Panel (shown when callHierarchyRoot is set) ──
    if (callHierarchyRoot && props.serverUrl) {
      const chProps: CallHierarchyPanelVanillaProps = {
        rootFunction: callHierarchyRoot,
        apiBaseUrl: props.serverUrl,
        t: props.t,
        isDark,
        colors: {
          border: colors.border,
          textPrimary: colors.text,
          textSecondary: colors.textSecondary,
          error: colors.cycleBorder,
        },
      };
      if (!callHierarchyHandle) {
        callHierarchyHandle = mountCallHierarchyPanel(elemInfoPanel, chProps);
      } else {
        callHierarchyHandle.update(chProps);
      }
    } else {
      if (callHierarchyHandle) { callHierarchyHandle.destroy(); callHierarchyHandle = null; }
    }

    // ── Matrix popup ──
    const matrixGridOptions = computeMatrixGridOptions(
      dsmLevel,
      props.c4Model ?? null,
      props.coverageMatrix ?? null,
      props.complexityMatrix ?? null,
      hotspotState.data,
      codeGraphState.graph,
      selectedRepo,
      matrixPopup?.filterElementId ?? null,
      showCommunity,
    );
    // grid はデータを mount 時に固定するため、セル値・色に効くデータの世代を署名化して
    // matrixPanel へ渡す（構造不変でもデータ確定時に remount させる）。
    const matrixDataSig = JSON.stringify([
      refVersion(props.coverageMatrix ?? null),
      refVersion(props.complexityMatrix ?? null),
      refVersion(hotspotState.data),
      refVersion(codeGraphState.graph),
      showCommunity,
      selectedRepo,
      matrixPopup?.filterElementId ?? null,
      dsmLevel,
    ]);
    const matrixPanelColors: MatrixPanelVanillaProps['colors'] = {
      bg: colors.bg,
      border: colors.border,
      accent: colors.accent,
      hover: colors.hover,
      focus: colors.focus,
      textMuted: colors.textMuted,
      textSecondary: colors.textSecondary,
    };
    if (matrixPopup) {
      if (!matrixPopupHandle) {
        matrixPopupHandle = mountResizablePopup(popupHost, {
          title: props.t('c4.matrix.title'),
          ariaLabel: 'Matrix panel',
          onClose: () => { matrixPopup = null; scheduleRender(); },
          isDark,
          colors,
          size: null,
          onSizeChange: () => { /* managed internally */ },
          maximized: false,
          onMaximizedChange: () => { /* managed internally */ },
          i18nMaximize: props.t('c4.popup.maximize'),
          i18nRestore: props.t('c4.popup.restore'),
          i18nClose: props.t('c4.popup.close'),
          i18nResize: props.t('c4.popup.resize'),
          mountContent: (c: HTMLElement) => {
            const mpProps: MatrixPanelVanillaProps = {
              gridOptions: matrixGridOptions,
              dataSig: matrixDataSig,
              isDark,
              level: dsmLevel,
              onLevelChange: (lv: 'package' | 'component' | 'code') => { dsmLevel = lv; scheduleRender(); },
              colors: matrixPanelColors,
              t: props.t,
            };
            const handle = mountMatrixPanel(c, mpProps);
            matrixInnerHandle = handle;
            return handle;
          },
        });
      } else {
        matrixPopupHandle.update({
          title: props.t('c4.matrix.title'),
          ariaLabel: 'Matrix panel',
          onClose: () => { matrixPopup = null; scheduleRender(); },
          isDark,
          colors,
          size: null,
          onSizeChange: () => { /* managed internally */ },
          maximized: false,
          onMaximizedChange: () => { /* managed internally */ },
          i18nMaximize: props.t('c4.popup.maximize'),
          i18nRestore: props.t('c4.popup.restore'),
          i18nClose: props.t('c4.popup.close'),
          i18nResize: props.t('c4.popup.resize'),
          mountContent: (c: HTMLElement) => {
            // mountContent is only called once by resizablePopup; this branch is unreachable
            // but kept for API compatibility.
            const mpProps: MatrixPanelVanillaProps = {
              gridOptions: matrixGridOptions,
              dataSig: matrixDataSig,
              isDark,
              level: dsmLevel,
              onLevelChange: (lv: 'package' | 'component' | 'code') => { dsmLevel = lv; scheduleRender(); },
              colors: matrixPanelColors,
              t: props.t,
            };
            const handle = mountMatrixPanel(c, mpProps);
            matrixInnerHandle = handle;
            return handle;
          },
        });
        // Update the inner matrix panel handle directly with current data
        matrixInnerHandle?.update({
          gridOptions: matrixGridOptions,
          dataSig: matrixDataSig,
          isDark,
          level: dsmLevel,
          onLevelChange: (lv: 'package' | 'component' | 'code') => { dsmLevel = lv; scheduleRender(); },
          colors: matrixPanelColors,
          t: props.t,
        });
      }
    } else {
      if (matrixPopupHandle) { matrixPopupHandle.destroy(); matrixPopupHandle = null; }
      if (matrixInnerHandle) { matrixInnerHandle = null; /* destroyed via matrixPopupHandle.destroy() */ }
    }

    // ── Scatter popup ──
    if (scatterPopup) {
      const fnAnalysisEntries = props.functionAnalysisEntries && scatterPopup.filterElementId
        ? functionAnalysisEntriesForElement(props.functionAnalysisEntries, scatterPopup.filterElementId, props.c4Model?.elements ?? [])
        : (props.functionAnalysisEntries ?? []);
      const buildScatterProps = (): ScatterPanelProps => ({
        entries: fnAnalysisEntries,
        view: scatterViewMode,
        tourActive,
        isDark,
        onViewChange: (m) => { scatterViewMode = m; scheduleRender(); },
        onTourToggle: () => {
          tourActive = !tourActive;
          // Starting the tour forces the scatter view (tour overlays the bubble plot).
          if (tourActive) scatterViewMode = 'scatter';
          scheduleRender();
        },
        onFunctionOpen: (filePath) => props.onOpenFile?.(filePath),
        colors: {
          border: colors.border,
          text: colors.text,
          textSecondary: colors.textSecondary,
          textMuted: colors.textMuted,
        },
        t: props.t,
      });
      const scatterShell = {
        title: props.t('c4.scatter.title'),
        ariaLabel: 'Scatter plot panel',
        onClose: () => { scatterPopup = null; scheduleRender(); },
        isDark,
        colors,
        size: null,
        onSizeChange: () => {},
        maximized: false,
        onMaximizedChange: () => {},
        i18nMaximize: props.t('c4.popup.maximize'),
        i18nRestore: props.t('c4.popup.restore'),
        i18nClose: props.t('c4.popup.close'),
        i18nResize: props.t('c4.popup.resize'),
        mountContent: (c: HTMLElement) => {
          const handle = mountScatterPanel(c, buildScatterProps());
          scatterInnerHandle = handle;
          return handle;
        },
      };
      if (!scatterPopupHandle) {
        scatterPopupHandle = mountResizablePopup(popupHost, scatterShell);
      } else {
        scatterPopupHandle.update(scatterShell);
        scatterInnerHandle?.update(buildScatterProps());
      }
    } else {
      if (scatterPopupHandle) { scatterPopupHandle.destroy(); scatterPopupHandle = null; }
      if (scatterInnerHandle) { scatterInnerHandle = null; /* destroyed via scatterPopupHandle.destroy() */ }
    }

    // ── Graph popup (code graph) ──
    if (showGraphPopup) {
      const repo = getSelectedRepo();
      const graphState: CodeGraphPanelProps['graphState'] = (() => {
        if (codeGraphState.loading) return { status: 'loading' };
        if (!repo) return { status: 'no-repo' };
        if (!codeGraphState.graph) return { status: 'no-graph' };
        return { status: 'ready', graph: codeGraphState.graph };
      })();
      const runGraphSearch = (query: string): void => {
        if (!query.trim()) { graphPanelHighlighted = new Set(); scheduleRender(); return; }
        void (async () => {
          try {
            const res = await fetch(`${props.serverUrl}/api/code-graph/query?q=${encodeURIComponent(query)}`);
            if (!res.ok) return;
            const data = (await res.json()) as { nodes: string[] };
            graphPanelHighlighted = new Set(data.nodes);
            scheduleRender();
          } catch (err) {
            console.error('[c4Viewer] code graph search failed', err);
          }
        })();
      };
      const runGraphNodeClick = (nodeId: string): void => {
        void (async () => {
          try {
            const res = await fetch(`${props.serverUrl}/api/code-graph/explain?id=${encodeURIComponent(nodeId)}`);
            if (!res.ok) return;
            const data = (await res.json()) as { node?: CodeGraphNode };
            graphPanelSelectedNode = data.node ?? null;
            scheduleRender();
          } catch (err) {
            console.error('[c4Viewer] code graph explain failed', err);
          }
        })();
      };
      const buildGraphProps = (): CodeGraphPanelProps => ({
        graphState,
        highlightedNodes: graphPanelHighlighted,
        selectedNode: graphPanelSelectedNode,
        // Ghost-edge (temporal coupling) overlay is sourced separately for the
        // file-level code graph; not wired into this popup yet, so keep it off.
        showSubagentDirectionalHint: false,
        ghostEdges: [],
        ghostEdgesEnabled: false,
        ghostEdgeGranularity: 'commit',
        isDark,
        onSearch: runGraphSearch,
        onRefetch: () => { codeGraphEnabled = true; fetchCodeGraph(); },
        onNodeClick: runGraphNodeClick,
        communitySummaries: codeGraphState.graph?.communitySummaries,
        t: props.t,
      });
      const graphShell = {
        title: props.t('c4.graph.title'),
        ariaLabel: 'Code graph panel',
        onClose: () => { showGraphPopup = false; scheduleRender(); },
        isDark,
        colors,
        size: null,
        onSizeChange: () => {},
        maximized: false,
        onMaximizedChange: () => {},
        i18nMaximize: props.t('c4.popup.maximize'),
        i18nRestore: props.t('c4.popup.restore'),
        i18nClose: props.t('c4.popup.close'),
        i18nResize: props.t('c4.popup.resize'),
        mountContent: (c: HTMLElement) => {
          const handle = mountCodeGraphPanel(c, buildGraphProps());
          graphInnerHandle = handle;
          return handle;
        },
      };
      if (!graphPopupHandle) {
        graphPopupHandle = mountResizablePopup(popupHost, graphShell);
      } else {
        graphPopupHandle.update(graphShell);
        graphInnerHandle?.update(buildGraphProps());
      }
    } else {
      if (graphPopupHandle) { graphPopupHandle.destroy(); graphPopupHandle = null; }
      if (graphInnerHandle) { graphInnerHandle = null; /* destroyed via graphPopupHandle.destroy() */ }
      // Reset transient search/selection so reopening the popup starts clean
      // (the React panel got this for free via per-mount state).
      if (graphPanelHighlighted.size > 0) graphPanelHighlighted = new Set();
      graphPanelSelectedNode = null;
    }

    // ── Add Element Dialog ──
    {
      const parentCandidates = (() => {
        if (!props.c4Model) return [];
        return props.c4Model.elements
          .filter(e => e.type === 'system' || e.type === 'container' || e.type === 'component')
          .map(e => ({ id: e.id, name: e.name }));
      })();
      // 編集モード（editElementId 非 null）は対象要素の値を initial に流し込み、onUpdateElement へ配線する。
      const editingElem = editElementId
        ? props.c4Model?.elements.find(e => e.id === editElementId)
        : null;
      const aedInitial = editingElem
        ? {
            name: editingElem.name,
            description: editingElem.description ?? '',
            external: editingElem.external ?? false,
          }
        : null;
      const aedProps: AddElementDialogVanillaProps = {
        open: addElementDialogOpen,
        elementType: addElementDialogType,
        initial: aedInitial,
        onSubmit: (data) => {
          if (editElementId) props.onUpdateElement?.(editElementId, data);
          else props.onAddElement?.(data);
          editElementId = null;
          addElementDialogOpen = false;
          scheduleRender();
        },
        onClose: () => { editElementId = null; addElementDialogOpen = false; scheduleRender(); },
        parentCandidates,
      };
      if (!addElementDialogHandle) {
        addElementDialogHandle = mountAddElementDialog(dialogsHost, aedProps);
      } else {
        addElementDialogHandle.update(aedProps);
      }
    }

    // ── Add Relationship Dialog ──
    {
      const relFrom = selectedElementId ?? '';
      const relFromName = props.c4Model?.elements.find(e => e.id === relFrom)?.name ?? relFrom;
      const relCandidates = (() => {
        if (!props.c4Model) return [];
        // 旧 AddRelationshipDialog は候補を person/system/container に限定していた（component は除外）。
        const relatableTypes: readonly string[] = ['person', 'system', 'container'];
        return props.c4Model.elements
          .filter(e => e.id !== relFrom && relatableTypes.includes(e.type))
          .map(e => ({ id: e.id, name: e.name }));
      })();
      const ardProps: AddRelationshipDialogVanillaProps = {
        open: addRelationshipDialogOpen,
        from: relFrom,
        fromName: relFromName,
        candidates: relCandidates,
        onSubmit: (data) => { props.onAddRelationship?.(data); addRelationshipDialogOpen = false; scheduleRender(); },
        onClose: () => { addRelationshipDialogOpen = false; scheduleRender(); },
      };
      if (!addRelationshipDialogHandle) {
        addRelationshipDialogHandle = mountAddRelationshipDialog(dialogsHost, ardProps);
      } else {
        addRelationshipDialogHandle.update(ardProps);
      }
    }

    // ── Group Label Dialog ──
    {
      const gldProps: GroupLabelDialogVanillaProps = {
        open: groupLabelDialogOpen,
        onClose: () => { groupLabelDialogOpen = false; scheduleRender(); },
        onSave: () => { groupLabelDialogOpen = false; scheduleRender(); },
      };
      if (!groupLabelDialogHandle) {
        groupLabelDialogHandle = mountGroupLabelDialog(dialogsHost, gldProps);
      } else {
        groupLabelDialogHandle.update(gldProps);
      }
    }

    // Activity trend panel visibility
    trendPanel.style.display = showActivityTrend ? 'block' : 'none';
    trendPanel.style.borderColor = colors.border;
    trendPanel.style.background = colors.popupBg;

    // Context menu
    updateContextMenu(colors);

    // Element info panels
    updateElementInfoPanels(colors, t, selectedElementDetail);

    // Community info panel
    updateCommunityInfoPanel(colors, t, selectedCommunityInfo);
  }

  function updateOverlaySelects(colors: C4ThemeColors): void {
    const { c4Model, coverageMatrix, complexityMatrix, importanceMatrix, deadCodeMatrix, centralityMatrix, roleMatrix, dsmMatrix, fileAnalysisEntries } = props;
    const t = props.t;

    // Rebuild overlay category options
    overlaySelect.innerHTML = '';
    const opts: Array<{ value: string; label: string; disabled?: boolean }> = [
      { value: 'none', label: t('c4.overlay.none') },
      { value: 'dsm', label: t('c4.overlay.groupDsm'), disabled: !dsmMatrix || dsmMatrix.nodes.length === 0 },
      { value: 'size', label: t('c4.overlay.groupSize'), disabled: !fileAnalysisEntries?.length },
      { value: 'coverage', label: t('c4.overlay.groupCoverage'), disabled: !coverageMatrix || coverageMatrix.entries.length === 0 },
      { value: 'importance', label: t('c4.overlay.groupImportance'), disabled: !importanceMatrix },
      { value: 'structure', label: t('c4.overlay.groupStructure'), disabled: !centralityMatrix && !roleMatrix },
      { value: 'edit-complexity', label: t('c4.overlay.groupEditComplexity'), disabled: !complexityMatrix || complexityMatrix.entries.length === 0 },
      { value: 'dead-code', label: t('c4.overlay.groupDeadCode'), disabled: !deadCodeMatrix },
      { value: 'hotspot', label: t('c4.overlay.groupHotspot') },
      { value: 'architecture', label: t('c4.overlay.groupArchitecture'), disabled: !fileAnalysisEntries?.length },
    ];
    for (const o of opts) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      opt.disabled = !!o.disabled;
      overlaySelect.appendChild(opt);
    }
    overlaySelect.value = overlayCategory;

    // Sub-select
    const subOpts: Array<{ value: string; label: string }> = [];
    if (overlayCategory === 'coverage') subOpts.push({ value: 'coverage-lines', label: t('c4.overlay.coverageLines') }, { value: 'coverage-branches', label: t('c4.overlay.coverageBranches') }, { value: 'coverage-functions', label: t('c4.overlay.coverageFunctions') });
    else if (overlayCategory === 'dsm') subOpts.push({ value: 'dsm-cyclic', label: t('c4.overlay.dsmCyclic') }, { value: 'dsm-out', label: t('c4.overlay.dsmOut') }, { value: 'dsm-in', label: t('c4.overlay.dsmIn') });
    else if (overlayCategory === 'edit-complexity') subOpts.push({ value: 'edit-complexity-most', label: t('c4.overlay.editComplexityMost') }, { value: 'edit-complexity-highest', label: t('c4.overlay.editComplexityHighest') });
    else if (overlayCategory === 'importance') subOpts.push({ value: 'importance', label: t('c4.overlay.importance') }, { value: 'defect-risk', label: t('c4.overlay.defectRisk') });
    else if (overlayCategory === 'structure') subOpts.push({ value: 'centrality', label: t('c4.overlay.centrality') }, { value: 'function-roles', label: t('c4.overlay.functionRoles') });
    else if (overlayCategory === 'hotspot') subOpts.push({ value: 'hotspot-frequency', label: t('c4.overlay.hotspotFrequency') }, { value: 'hotspot-risk', label: t('c4.overlay.hotspotRisk') });
    else if (overlayCategory === 'dead-code') subOpts.push({ value: 'dead-code-score', label: t('c4.overlay.deadCodeScore') });
    else if (overlayCategory === 'size') subOpts.push({ value: 'size-loc', label: t('c4.overlay.sizeLoc') }, { value: 'size-files', label: t('c4.overlay.sizeFiles') }, { value: 'size-functions', label: t('c4.overlay.sizeFunctions') });
    else if (overlayCategory === 'architecture') subOpts.push({ value: 'architecture-ui', label: t('c4.overlay.architectureUi') }, { value: 'architecture-layer', label: t('c4.overlay.architectureLayer') });

    if (subOpts.length > 0) {
      overlaySubSelect.style.display = '';
      overlaySubSelect.innerHTML = '';
      for (const o of subOpts) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        overlaySubSelect.appendChild(opt);
      }
      overlaySubSelect.value = metricOverlay;
    } else {
      overlaySubSelect.style.display = 'none';
    }
  }

  function updateContextMenu(colors: C4ThemeColors): void {
    if (!contextMenu || !props.c4Model) {
      ctxMenuOverlay.style.display = 'none';
      ctxMenuEl.style.display = 'none';
      return;
    }

    const caps = computeContextMenuCapabilities({
      c4Model: props.c4Model,
      c4Id: contextMenu.c4Id,
      drillStack,
      hasShowSequenceHandler: props.onShowSequence !== undefined,
      hasExportToNoteHandler: props.onExportToNote !== undefined,
      canShowManualContextActions,
      levelTargetType: getLevelTargetType() as import('@anytime-markdown/trail-core/c4').C4ElementType,
    });

    if (!caps.showContextMenu) {
      ctxMenuOverlay.style.display = 'none';
      ctxMenuEl.style.display = 'none';
      return;
    }

    ctxMenuOverlay.style.display = 'block';
    ctxMenuEl.style.display = 'block';
    ctxMenuEl.style.top = `${contextMenu.y}px`;
    ctxMenuEl.style.left = `${contextMenu.x}px`;
    ctxMenuEl.style.background = colors.contextMenuBg;
    ctxMenuEl.style.border = `1px solid ${colors.contextMenuBorder}`;

    const btnCss = `display:block;width:100%;padding:6px 16px;text-align:left;background:none;border:none;cursor:pointer;font-size:14px;color:${colors.contextMenuText};`;
    ctxMenuEl.innerHTML = '';

    const addBtn = (label: string, onClick: () => void, css = btnCss) => {
      const b = el('button', css, { type: 'button' });
      b.textContent = label;
      b.addEventListener('click', onClick);
      ctxMenuEl.appendChild(b);
    };

    const c4Id = contextMenu.c4Id;
    const t = props.t;

    if (caps.canDrillDown) addBtn(t('c4.drillDown'), () => handleDrillDown(c4Id));
    if (caps.canDrillUp) addBtn(t('c4.drillUp'), () => handleDrillUp());
    if (caps.canShowOnlyFrame) addBtn(soloFrameId === c4Id ? t('c4.clearFrameFilter') : t('c4.showOnlyThisFrame'), () => { soloFrameId === c4Id ? handleClearFrameFilter() : (soloFrameId = c4Id, contextMenu = null, scheduleRender(), rebuildDocument()); });
    if (caps.canOpenFile) addBtn(t('c4.openFile'), () => { const id = c4Id; const wp = id.slice(6); const ci = wp.indexOf('::'); const fp = ci === -1 ? wp : wp.slice(0, ci); props.onOpenFile?.(fp); contextMenu = null; scheduleRender(); });
    if (caps.canShowSequence) addBtn(t('c4.showSequence'), () => { props.onShowSequence?.(c4Id); contextMenu = null; scheduleRender(); });
    if (caps.canCopyPath) addBtn(t('c4.copyPath'), () => {
      let path = c4Id;
      if (c4Id.startsWith('pkg_')) { const inner = c4Id.slice(4); const slash = inner.indexOf('/'); path = slash === -1 ? `packages/${inner}` : `packages/${inner.slice(0, slash)}/src/${inner.slice(slash + 1)}`; }
      else if (c4Id.startsWith('file::')) { const wp = c4Id.slice(6); const ci = wp.indexOf('::'); path = ci === -1 ? wp : wp.slice(0, ci); }
      navigator.clipboard.writeText(path).catch(() => {});
      contextMenu = null; scheduleRender();
    });
    addBtn(t('c4.contextMenu.openScatter'), () => { scatterPopup = { filterElementId: c4Id }; showGraphPopup = false; matrixPopup = null; contextMenu = null; scheduleRender(); });
    if (caps.canExportToNote) addBtn(t('c4.contextMenu.exportToNote'), () => {
      const elem = props.c4Model?.elements.find((e) => e.id === c4Id);
      if (!elem) { contextMenu = null; scheduleRender(); return; }
      const contextMarkdown = buildElementContextMarkdown(elem, c4Id, getSelectedRepo() || null);
      let imageDataUrl: string | undefined;
      try {
        imageDataUrl = canvasRef.current?.toDataURL('image/png');
      } catch {
        imageDataUrl = undefined; // 画像化失敗はテキストのみに縮退（note-page-export 仕様 §3.4）
      }
      props.onExportToNote?.({ title: elem.name, contextMarkdown, imageDataUrl });
      contextMenu = null; scheduleRender();
    });
    if (caps.canShowManualActions) {
      const relBtn = el('button', `display:flex;align-items:center;gap:8px;width:100%;padding:6px 16px;text-align:left;background:none;border:none;cursor:pointer;font-size:14px;color:${colors.contextMenuText};`, { type: 'button' });
      relBtn.appendChild(svgIcon(ICONS.link, 16));
      relBtn.appendChild(document.createTextNode('Rel'));
      relBtn.addEventListener('click', () => { selectedElementId = c4Id; addRelationshipDialogOpen = true; contextMenu = null; scheduleRender(); });
      ctxMenuEl.appendChild(relBtn);

      const delBtn = el('button', `display:flex;align-items:center;gap:8px;width:100%;padding:6px 16px;text-align:left;background:none;border:none;cursor:pointer;font-size:14px;color:${colors.cycleBorder};`, { type: 'button' });
      delBtn.appendChild(svgIcon(ICONS.delete, 16));
      delBtn.appendChild(document.createTextNode('Del'));
      delBtn.addEventListener('click', () => {
        if (!props.c4Model) return;
        const elem = props.c4Model.elements.find(e => e.id === c4Id);
        if (elem?.manual) { props.onRemoveElement?.(c4Id); if (selectedElementId === c4Id) selectedElementId = null; }
        contextMenu = null; scheduleRender();
      });
      ctxMenuEl.appendChild(delBtn);
    }
  }

  function updateElementInfoPanels(colors: C4ThemeColors, t: (k: string) => string, detail: SelectedElementInfo | null): void {
    // Multi-select panel
    if (selectedElementIds.length > 1 && props.c4Model) {
      multiSelectPanel.style.display = 'block';
      elemInfoPanel.style.display = 'none';
      communityInfoPanel.style.display = 'none';
      multiSelectPanel.style.background = colors.popupBg;
      multiSelectPanel.style.color = colors.text;
      multiSelectPanel.style.border = `1px solid ${colors.border}`;
      multiSelectPanel.innerHTML = '';
      const label = el('div', `font-size:0.65rem;color:${colors.textMuted};text-transform:uppercase;margin-bottom:6px;`);
      label.textContent = `${selectedElementIds.length} elements selected`;
      multiSelectPanel.appendChild(label);
      for (const id of selectedElementIds) {
        const elem = props.c4Model.elements.find(e => e.id === id);
        if (!elem) continue;
        const row = el('div', `padding:4px 0;border-bottom:1px solid ${colors.border};`);
        const typeLabel = el('div', `font-size:0.65rem;color:${colors.textMuted};text-transform:uppercase;`);
        typeLabel.textContent = elem.type;
        const nameLabel = el('div', `font-size:0.8rem;color:${colors.text};font-weight:600;word-break:break-word;`);
        nameLabel.textContent = elem.name;
        row.append(typeLabel, nameLabel);
        multiSelectPanel.appendChild(row);
      }
      return;
    }
    multiSelectPanel.style.display = 'none';

    // Single element info panel
    if (!selectedElementId || !props.c4Model) {
      elemInfoPanel.style.display = 'none';
      return;
    }
    const element = props.c4Model.elements.find(e => e.id === selectedElementId);
    if (!element || element.id.startsWith('community:')) {
      elemInfoPanel.style.display = 'none';
      return;
    }

    elemInfoPanel.style.display = 'block';
    elemInfoPanel.style.background = colors.popupBg;
    elemInfoPanel.style.color = colors.text;
    elemInfoPanel.style.border = `1px solid ${colors.border}`;
    elemInfoPanel.innerHTML = '';

    const typeEl = el('div', `font-size:0.65rem;color:${colors.textMuted};text-transform:uppercase;`);
    typeEl.textContent = element.type;
    const nameEl = el('div', `font-size:0.85rem;color:${colors.text};font-weight:700;line-height:1.3;margin-top:2px;word-break:break-word;`);
    nameEl.textContent = element.name;
    elemInfoPanel.append(typeEl, nameEl);

    if (element.technology) {
      const techEl = el('div', `font-size:0.7rem;color:${colors.accent};margin-top:4px;word-break:break-word;`);
      techEl.textContent = element.technology;
      elemInfoPanel.appendChild(techEl);
    }
    if (element.description) {
      const descEl = el('div', `font-size:0.75rem;color:${colors.textSecondary};line-height:1.45;margin-top:8px;word-break:break-word;`);
      descEl.textContent = element.description;
      elemInfoPanel.appendChild(descEl);
    }

    // ID
    const idEl = el('div', `font-size:0.65rem;color:${colors.textMuted};margin-top:8px;word-break:break-all;`);
    idEl.textContent = element.id;
    elemInfoPanel.appendChild(idEl);

    // DSM / Metrics / Community セクション（vanilla 移行で欠落していた復元分）
    if (detail) {
      appendSelectedElementDetailSections(elemInfoPanel, detail, {
        colors: {
          border: colors.border,
          text: colors.text,
          textSecondary: colors.textSecondary,
          textMuted: colors.textMuted,
          accent: colors.accent,
          hover: colors.hover,
          bg: colors.bg,
        },
        t,
        isDark: props.isDark ?? false,
        codeGraph: codeGraphState.graph,
        featureMatrix: props.featureMatrix ?? null,
        matrixIconPath: ICONS.tableChart,
        graphIconPath: ICONS.accountTree,
        onOpenMatrix: () => openMatrixForElement(detail.element),
        onOpenGraph: toggleGraphPopup,
      });
    }

    // Documents section
    const { docLinks } = props;
    const documents = (docLinks ?? []).filter(doc => matchesDocScope(doc.c4Scope, element.id));
    const docSep = el('div', `border-top:1px solid ${colors.border};margin-top:10px;padding-top:8px;`);
    const docTitle = el('div', `font-size:0.7rem;color:${colors.textSecondary};font-weight:700;margin-bottom:4px;`);
    docTitle.textContent = 'Documents';
    docSep.appendChild(docTitle);
    if (documents.length === 0) {
      const empty = el('div', `font-size:0.7rem;color:${colors.textMuted};`);
      empty.textContent = 'No linked documents';
      docSep.appendChild(empty);
    } else {
      for (const doc of documents) {
        const docBtn = el('button', `display:flex;align-items:center;min-height:26px;padding:2px 4px;background:transparent;border:none;cursor:pointer;width:100%;text-align:left;`, { type: 'button' });
        const badge = el('span', `display:inline-flex;align-items:center;height:16px;padding:0 4px;margin-right:6px;border-radius:4px;background:${DOC_TYPE_COLORS[doc.type] ?? DOC_TYPE_FALLBACK_COLOR};color:#000;font-size:0.62rem;font-weight:700;flex-shrink:0;`);
        badge.textContent = doc.type;
        const titleSpan = el('span', `font-size:0.7rem;color:${colors.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`);
        titleSpan.textContent = doc.title;
        docBtn.append(badge, titleSpan);
        docBtn.addEventListener('click', () => props.onDocLinkClick?.(doc));
        docSep.appendChild(docBtn);
      }
    }
    elemInfoPanel.appendChild(docSep);

    // Functions section (code elements)
    if (element.type === 'code') {
      const fnSep = el('div', `border-top:1px solid ${colors.border};margin-top:10px;padding-top:8px;`);
      const fnTitle = el('div', `font-size:0.7rem;color:${colors.textSecondary};font-weight:700;margin-bottom:4px;`);
      fnTitle.textContent = t('c4.popup.functions');
      fnSep.appendChild(fnTitle);
      if (elemFnsState.loading) {
        const l = el('div', `font-size:0.65rem;color:${colors.textMuted};`);
        l.textContent = '...';
        fnSep.appendChild(l);
      } else if (!elemFnsState.data || elemFnsState.data.symbols.length === 0) {
        const e = el('div', `font-size:0.65rem;color:${colors.textMuted};`);
        e.textContent = t('c4.popup.functions.empty');
        fnSep.appendChild(e);
      } else {
        const list = el('div', 'display:flex;flex-direction:column;gap:2px;');
        for (const sym of elemFnsState.data.symbols) {
          const row = el('div', 'display:flex;align-items:center;gap:4px;');
          const badge = kindBadge(sym.kind, t);
          const kindSpan = el('span', `font-size:0.62rem;font-weight:700;color:${colors.codeLink};flex-shrink:0;text-transform:uppercase;`);
          kindSpan.title = badge.full;
          kindSpan.setAttribute('aria-label', badge.full);
          kindSpan.textContent = badge.short;
          const nameSpan = el('span', `font-size:0.7rem;color:${colors.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;`);
          nameSpan.textContent = sym.name;
          const lineSpan = el('span', `font-size:0.62rem;color:${colors.textMuted};flex-shrink:0;`);
          lineSpan.textContent = `:${sym.line + 1}`;
          row.append(kindSpan, nameSpan, lineSpan);
          if ((sym.kind === 'function' || sym.kind === 'method') && props.onOpenFunctionTree) {
            const treeBtn = el('button', `padding:2px;margin-left:2px;background:transparent;border:none;cursor:pointer;color:${colors.textSecondary};`, { type: 'button', title: t('c4.callHierarchy.showFunctionTree'), 'aria-label': t('c4.callHierarchy.showFunctionTree') });
            treeBtn.appendChild(svgIcon(ICONS.accountTree, 14));
            treeBtn.addEventListener('click', (e) => { e.stopPropagation(); props.onOpenFunctionTree?.(sym.filePath, sym.name, sym.line + 1); });
            row.appendChild(treeBtn);
          }
          list.appendChild(row);
        }
        fnSep.appendChild(list);
      }
      elemInfoPanel.appendChild(fnSep);
    }
  }

  function updateCommunityInfoPanel(colors: C4ThemeColors, t: (k: string) => string, selectedCommunityInfo: { cid: number; displayName: string; color: string; nodeCount: number; summaryText?: string; children: Array<{ id: string; name: string }> } | null): void {
    if (!selectedCommunityInfo || selectedElementId?.startsWith('community:') === false) {
      communityInfoPanel.style.display = 'none';
      return;
    }
    if (selectedElementId && !selectedElementId.startsWith('community:')) {
      communityInfoPanel.style.display = 'none';
      return;
    }

    communityInfoPanel.style.display = 'block';
    communityInfoPanel.style.background = colors.popupBg;
    communityInfoPanel.style.color = colors.text;
    communityInfoPanel.style.border = `1px solid ${colors.border}`;
    communityInfoPanel.innerHTML = '';

    const typeEl = el('div', `font-size:0.65rem;color:${colors.textMuted};text-transform:uppercase;`);
    typeEl.textContent = t('c4.community.title');
    communityInfoPanel.appendChild(typeEl);

    const nameRow = el('div', 'display:flex;align-items:center;gap:6px;margin-top:2px;');
    const dot = el('div', `width:10px;height:10px;border-radius:50%;background:${selectedCommunityInfo.color};flex-shrink:0;`);
    const nameEl = el('div', `font-size:0.85rem;color:${colors.text};font-weight:700;line-height:1.3;word-break:break-word;`);
    nameEl.textContent = selectedCommunityInfo.displayName;
    nameRow.append(dot, nameEl);
    communityInfoPanel.appendChild(nameRow);

    if (selectedCommunityInfo.summaryText) {
      const sumEl = el('div', `font-size:0.75rem;color:${colors.textSecondary};line-height:1.45;margin-top:8px;word-break:break-word;`);
      sumEl.textContent = selectedCommunityInfo.summaryText;
      communityInfoPanel.appendChild(sumEl);
    }

    const countSep = el('div', `border-top:1px solid ${colors.border};margin-top:10px;padding-top:6px;`);
    const countLabel = el('div', `font-size:0.65rem;color:${colors.textMuted};`);
    countLabel.textContent = t('c4.community.nodeCount');
    const countVal = el('div', `font-size:0.8rem;color:${colors.text};font-weight:700;`);
    countVal.textContent = String(selectedCommunityInfo.nodeCount);
    countSep.append(countLabel, countVal);
    communityInfoPanel.appendChild(countSep);

    if (selectedCommunityInfo.children.length > 0) {
      const childSep = el('div', `border-top:1px solid ${colors.border};margin-top:10px;padding-top:6px;`);
      const childTitle = el('div', `font-size:0.7rem;color:${colors.textSecondary};font-weight:700;margin-bottom:4px;`);
      childTitle.textContent = t('c4.community.containers');
      childSep.appendChild(childTitle);
      for (const child of selectedCommunityInfo.children.slice(0, 8)) {
        const childEl = el('div', `font-size:0.65rem;color:${colors.textMuted};padding:1px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`);
        childEl.textContent = `• ${child.name}`;
        childSep.appendChild(childEl);
      }
      if (selectedCommunityInfo.children.length > 8) {
        const more = el('div', `font-size:0.65rem;color:${colors.textMuted};margin-top:2px;`);
        more.textContent = `+ ${selectedCommunityInfo.children.length - 8}`;
        childSep.appendChild(more);
      }
      communityInfoPanel.appendChild(childSep);
    }

    const cidEl = el('div', `font-size:0.65rem;color:${colors.textMuted};margin-top:8px;`);
    cidEl.textContent = `#${selectedCommunityInfo.cid}`;
    communityInfoPanel.appendChild(cidEl);
  }

  // ── Initial data fetch ──
  fetchHotspot();
  fetchDefectRisk();
  fetchCodeGraph();

  // ── Initial render ──
  rebuildDocument();
  render();

  // ── Update ──
  function update(newProps: C4ViewerViewProps): void {
    if (destroyed) return;
    const prevServerUrl = props.serverUrl;
    const prevRepo = props.selectedRepo ?? selectedRepoInternal;
    const prevRelease = props.selectedRelease;
    const prevLevel = currentLevel;
    props = newProps;

    // Re-init selectedRepo if needed
    const repoOptions = getRepoOptions();
    const selectedRepo = props.selectedRepo ?? selectedRepoInternal;
    if (!props.selectedRepo) {
      if (repoOptions.length === 0) { if (selectedRepo !== '') { selectedRepoInternal = ''; props.onRepoSelect?.(''); } }
      else if (!repoOptions.includes(selectedRepo)) { selectedRepoInternal = repoOptions[0]; props.onRepoSelect?.(repoOptions[0]); }
    }

    // Reset overlay if repo changed
    const newRepo = props.selectedRepo ?? selectedRepoInternal;
    if (newRepo !== prevRepo) { overlayCategory = 'none'; metricOverlay = 'none'; }

    const needsRefetch = props.serverUrl !== prevServerUrl || newRepo !== prevRepo || props.selectedRelease !== prevRelease;
    if (needsRefetch) { fetchHotspot(); fetchDefectRisk(); fetchTC(); fetchCodeGraph(); }

    if ((props.initialLevel ?? 1) !== (prevLevel) && props.initialLevel !== undefined && props.initialLevel !== currentLevel) {
      currentLevel = props.initialLevel;
    }

    rebuildDocument();
    render();
  }

  // ── Destroy ──
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    // Abort all pending fetches
    hotspotState.controller?.abort();
    defectRiskState.controller?.abort();
    tcState.controller?.abort();
    elemFnsState.controller?.abort();
    fnGraphState.controller?.abort();
    codeGraphState.controller?.abort();
    if (hotspotState.timer !== null) clearTimeout(hotspotState.timer);
    if (defectRiskState.timer !== null) clearTimeout(defectRiskState.timer);
    if (tcState.timer !== null) clearTimeout(tcState.timer);

    // Close WS
    try { codeGraphState.ws?.close(); } catch { /* ignore */ }

    // Destroy child mounts
    graphCanvasHandle?.destroy();
    minimapHandle?.destroy();

    // Destroy panel/overlay/dialog handles
    treeHandle?.destroy();
    hotspotControlsHandle?.destroy();
    defectRiskControlsHandle?.destroy();
    tcControlsHandle?.destroy();
    overlayLegendHandle?.destroy();
    matrixPopupHandle?.destroy();
    scatterPopupHandle?.destroy();
    graphPopupHandle?.destroy();
    trendPanelHandle?.destroy();
    deadCodeHandle?.destroy();
    callHierarchyHandle?.destroy();
    addElementDialogHandle?.destroy();
    addRelationshipDialogHandle?.destroy();
    groupLabelDialogHandle?.destroy();

    // Abort trend fetches
    for (const c of trendDataState.controllers) c.abort();
    for (const t of trendDataState.timers) clearTimeout(t);

    // Remove context menu DOM (appended to document.body)
    ctxMenuOverlay.remove();
    ctxMenuEl.remove();

    // Remove root
    root.remove();
  }

  return { update, destroy };
}
