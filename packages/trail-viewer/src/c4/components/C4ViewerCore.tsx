import type { GraphDocument, GraphNode } from '@anytime-markdown/graph-core';
import { engine, layoutWithSubgroups, MinimapCanvas, state as graphState } from '@anytime-markdown/graph-core';
import type { BoundaryInfo, C4Element, C4Model, C4ReleaseEntry, CommunityOverlayEntry, ComplexityMatrix, CoverageDiffMatrix, CoverageMatrix, DocLink, DsmMatrix, FeatureMatrix, HotspotMap, ImportanceMatrix, ManualGroup, MetricOverlay } from '@anytime-markdown/trail-core/c4';
import { aggregateDsmToC4ComponentLevel, aggregateDsmToC4ContainerLevel, aggregateDsmToC4SystemLevel, aggregateHotspotToC4, buildC4ElementById, buildCommunityTree, buildElementTree, buildLevelView, buildSizeMatrix, c4ToGraphDocument, collectDescendantIds, computeColorMap, computeCommunityOverlay, computeFileHotspot, filterDsmMatrix, filterModelForDrill, filterTreeByLevel, mapFileToC4Elements, resolveSelectedElementCommunity, sortDsmMatrixByName } from '@anytime-markdown/trail-core/c4';
import type { SizeMatrix } from '@anytime-markdown/trail-core/c4';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import HubIcon from '@mui/icons-material/Hub';
import LayersIcon from '@mui/icons-material/Layers';
import LinkIcon from '@mui/icons-material/Link';
import TableChartIcon from '@mui/icons-material/TableChart';
import TimelineIcon from '@mui/icons-material/Timeline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ButtonGroup from '@mui/material/ButtonGroup';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { useTrailI18n } from '../../i18n';
import { CONTEXT_MENU_SHADOW, DOC_TYPE_COLORS, DOC_TYPE_FALLBACK_COLOR, getC4Colors, LOADING_OVERLAY_BG, POPUP_SHADOW } from '../../theme/c4Tokens';
import type { FileAnalysisApiEntry } from '../hooks/fetchFileAnalysisApi';
import { useC4GhostEdges } from '../hooks/useC4GhostEdges';
import { useDefectRisk } from '../hooks/useDefectRisk';
import { useHotspot } from '../hooks/useHotspot';
import { useTemporalCoupling } from '../hooks/useTemporalCoupling';
import { useElementFunctions } from '../hooks/useElementFunctions';
import { DeadCodeDetailSection } from './panels/DeadCodeDetailSection';
import { fileAnalysisEntriesForElement } from './fileAnalysisEntriesForElement';
import { ResizablePopup, type ResizablePopupSize } from './widgets/ResizablePopup';
import GroupWorkIcon from '@mui/icons-material/GroupWork';

import { CodeGraphPanelSkeleton } from '../../components/shared/CodeGraphPanelSkeleton';
const CodeGraphPanel = lazy(() =>
  import('../../components/CodeGraphPanel').then((m) => ({ default: m.CodeGraphPanel })),
);
import { communityColor } from '../../components/communityColors';
import { COMMUNITY_ROLE_LABELS, getCommunityRoleBgColors } from '../communityRoleColors';
import { useCodeGraph } from '../../hooks/useCodeGraph';
import { computeClaudeActivityColorMap, computeConflictBorderMap,computeMultiAgentColorMap } from '../claudeActivityColorMap';
import { computeContextMenuCapabilities } from '../utils/contextMenuCapabilities';
import { ActivityTrendChart } from './panels/ActivityTrendChart';
import { C4DialogsArea } from './C4DialogsArea';
import type { C4ElementKind, ElementFormData, RelationshipFormData } from './dialogs/C4EditDialogs';
import { C4ElementTree } from './panels/C4ElementTree';
import { GraphCanvas } from './canvases/GraphCanvas';
import { HotspotControls, type HotspotControlsValue } from './overlays/HotspotControls';
import { MatrixPanel } from './panels/MatrixPanel';
import { type CommunityLegendItem,OverlayLegend } from './overlays/OverlayLegend';
import {
  TemporalCouplingSettingsPopup,
  applyGhostEdgeMode,
  type TemporalCouplingControlsValue,
} from './overlays/TemporalCouplingControls';

import {
  CURRENT_RELEASE_TAG,
  DEFAULT_TC_VALUE,
  DRILL_SCOPE_TYPES,
  FILTER_CHECKABLE_TYPES,
  SELECTED_ELEMENT_DETAILS_RIGHT_OFFSET,
  SELECTED_ELEMENT_DETAILS_WIDTH,
  TREND_CHART_POPUP_GAP,
  TREND_CHART_POPUP_MAX_WIDTH,
  TREND_CHART_RESERVED_RIGHT_WIDTH,
  UNKNOWN_REPO_KEY,
} from '../constants';
import { OVERLAY_CATEGORY_DEFAULTS, type OverlayCategory } from '../state/overlayCategories';
import { createInitialState, graphReducer } from '../state/graphReducer';
import {
  canShowManualContextActions,
  computeBounds,
  fitToContent,
  formatPct,
  getActivityTrendChartPlacement,
  getActivityTrendChartWidth,
  matchesDocScope,
} from '../utils/c4ViewerHelpers';
import type { C4ViewerCoreProps } from './types';

export type { C4ViewerCoreProps };

export function C4ViewerCore({
  isDark = false,
  c4Model,
  boundaries: boundaryInfos,
  featureMatrix,
  dsmMatrix,
  coverageMatrix,
  complexityMatrix,
  importanceMatrix,
  deadCodeMatrix,
  fileAnalysisEntries = [],
  docLinks,
  connected,
  analysisProgress,
  onAddElement,
  onUpdateElement,
  onAddRelationship,
  onRemoveElement,
  onPurgeDeleted,
  onDocLinkClick,
  onOpenFile,
  onShowSequence,
  containerHeight = '100vh',
  releases = [],
  selectedRelease = CURRENT_RELEASE_TAG,
  onReleaseSelect,
  selectedRepo: selectedRepoProp,
  onRepoSelect,
  serverUrl = '',
  claudeActivity,
  multiAgentActivity,
  onResetClaudeActivity,
  manualGroups,
  initialLevel,
}: Readonly<C4ViewerCoreProps>) {
  const { t } = useTrailI18n();
  const colors = useMemo(() => getC4Colors(isDark), [isDark]);

  // リリース entry と current entry 両方からリポジトリを収集する
  const repoOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of releases) {
      const key = r.repoName ?? (r.tag === CURRENT_RELEASE_TAG ? '' : UNKNOWN_REPO_KEY);
      if (!key) continue;
      seen.add(key);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [releases]);

  const [selectedRepoInternal, setSelectedRepoInternal] = useState<string>(() => repoOptions[0] ?? '');
  const selectedRepo = selectedRepoProp ?? selectedRepoInternal;

  useEffect(() => {
    if (repoOptions.length === 0) {
      if (selectedRepo !== '') {
        setSelectedRepoInternal('');
        onRepoSelect?.('');
      }
      return;
    }
    if (!repoOptions.includes(selectedRepo)) {
      const next = repoOptions[0];
      setSelectedRepoInternal(next);
      onRepoSelect?.(next);
    }
  }, [repoOptions, selectedRepo, onRepoSelect]);

  const visibleReleases = useMemo(() => {
    if (releases.length === 0) return [];
    // current エントリに repoName が付いている行が1件でもあれば「複数リポジトリ対応モード」として扱う
    const hasRepoTaggedCurrent = releases.some(
      (r) => r.tag === CURRENT_RELEASE_TAG && r.repoName != null && r.repoName !== '',
    );
    const out: C4ReleaseEntry[] = [];
    for (const r of releases) {
      if (r.tag === CURRENT_RELEASE_TAG) {
        if (hasRepoTaggedCurrent) {
          // 複数リポジトリ対応: 選択中の repo と一致する current のみ表示
          if ((r.repoName ?? '') === selectedRepo) {
            out.push(r);
          }
        } else {
          // レガシー互換: repoName を持たない current は常に表示
          out.push(r);
        }
        continue;
      }
      if (selectedRepo === '') continue;
      if ((r.repoName ?? UNKNOWN_REPO_KEY) === selectedRepo) {
        out.push(r);
      }
    }
    return out;
  }, [releases, selectedRepo]);

  const handleRepoChange = useCallback((next: string): void => {
    setSelectedRepoInternal(next);
    onRepoSelect?.(next);
  }, [onRepoSelect]);

  const handleReleaseChange = useCallback((next: string): void => {
    onReleaseSelect?.(next);
  }, [onReleaseSelect]);

  const [state, dispatch] = useReducer(graphReducer, createInitialState());
  const [fullDoc, setFullDoc] = useState<GraphDocument | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(initialLevel ?? 1);

  const [showCoverage, setShowCoverage] = useState(false);
  const [showAncestorEdges, setShowAncestorEdges] = useState(false);
  const [matrixPopup, setMatrixPopup] = useState<{
    readonly initialLevel: 'package' | 'component' | 'code';
    readonly filterElementId: string | null;
  } | null>(null);
  const showMatrixPopup = matrixPopup !== null;
  const [matrixPopupSize, setMatrixPopupSize] = useState<ResizablePopupSize | null>(null);
  const [matrixPopupMaximized, setMatrixPopupMaximized] = useState(false);
  const [showGraphPopup, setShowGraphPopup] = useState(false);
  const [graphPopupSize, setGraphPopupSize] = useState<ResizablePopupSize | null>(null);
  const [graphPopupMaximized, setGraphPopupMaximized] = useState(false);
  const openMatrixForElement = useCallback((element: C4Element) => {
    setShowGraphPopup(false);
    if (element.type === 'container' || element.type === 'containerDb') {
      setMatrixPopup({ initialLevel: 'component', filterElementId: element.id });
    } else if (element.type === 'component') {
      setMatrixPopup({ initialLevel: 'code', filterElementId: element.id });
    } else if (element.type === 'code') {
      setMatrixPopup({ initialLevel: 'code', filterElementId: element.boundaryId ?? null });
    } else {
      setMatrixPopup({ initialLevel: 'component', filterElementId: null });
    }
  }, []);
  const [metricOverlay, setMetricOverlay] = useState<MetricOverlay>('none');
  const [overlayCategory, setOverlayCategory] = useState<OverlayCategory>('none');
  const [drWindowDays, setDrWindowDays] = useState(90);
  const [tcValue, setTcValue] = useState<TemporalCouplingControlsValue>(DEFAULT_TC_VALUE);
  const [hotspotValue, setHotspotValue] = useState<HotspotControlsValue>({
    period: '30d',
    granularity: 'commit',
  });
  const isHotspotOverlay = metricOverlay === 'hotspot-frequency' || metricOverlay === 'hotspot-risk';
  // popup でも値を表示するため overlay 選択に関わらず常に fetch する。
  const { data: hotspotResponse, loading: hotspotLoading } = useHotspot({
    enabled: true,
    serverUrl,
    period: hotspotValue.period,
    granularity: hotspotValue.granularity,
    repo: selectedRepo || undefined,
  });
  const { entries: drEntries } = useDefectRisk({
    enabled: true,
    serverUrl,
    windowDays: drWindowDays,
    halfLifeDays: 90,
    repo: selectedRepo || undefined,
  });
  const [dsmLevel, setDsmLevel] = useState<'component' | 'package'>('component');
  const {
    edges: rawTcEdges,
    granularity: tcGranularity,
    loading: tcLoading,
  } = useTemporalCoupling({
    enabled: tcValue.enabled && !!selectedRepo,
    serverUrl,
    repoName: selectedRepo ?? '',
    windowDays: tcValue.windowDays,
    threshold: tcValue.threshold,
    topK: tcValue.topK,
    directional: false,
    granularity: tcValue.granularity,
  });
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<readonly string[]>([]);
  const [drillStack, setDrillStack] = useState<readonly { readonly element: C4Element; readonly prevLevel: number; readonly prevCheckedIds: ReadonlySet<string> | null }[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    readonly x: number;
    readonly y: number;
    readonly c4Id: string;
  } | null>(null);
  const [checkedPackageIds, setCheckedPackageIds] = useState<ReadonlySet<string> | null>(null);
  const [soloFrameId, setSoloFrameId] = useState<string | null>(null);
  const [centerOnSelect, setCenterOnSelect] = useState(false);

  // --- Community overlay state ---
  const [showCommunity, setShowCommunity] = useState(false);
  const [codeGraphEnabled, setCodeGraphEnabled] = useState(false);
  const [showActivityTrend, setShowActivityTrend] = useState(false);
  const { graph: codeGraph, loading: codeGraphLoading } = useCodeGraph(serverUrl, {
    enabled: showCommunity || codeGraphEnabled || currentLevel >= 2,
    release: selectedRelease,
    repo: selectedRepo,
  });

  // --- Flow mode state ---
  const ghostEdges = useC4GhostEdges(
    rawTcEdges,
    c4Model,
    currentLevel as 1 | 2 | 3 | 4,
    selectedRepo ?? null,
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // L1/L2/L3/L4 切り替え後に Fit を適用する残り回数。
  // 0 = Fit 不要。正値の間は SET_DOCUMENT に fit viewport を埋め込む。
  // setTimeout は React スケジューラと競合するため使わず、カウントダウン方式にする。
  const pendingFitCountRef = useRef(0);
  // Drill Up 後にセンタリングするターゲット c4Id。null = 全体 Fit のまま。
  const pendingCenterC4IdRef = useRef<string | null>(null);
  // state.document を effect から安全に読むための ref（selectedCommunityInfo effect 用）
  const stateRef = useRef(state);
  stateRef.current = state;

  // --- Editing state ---
  const [addElementType, setAddElementType] = useState<C4ElementKind | null>(null);
  const [editElement, setEditElement] = useState<{ id: string; type: C4ElementKind; name: string; description: string; external: boolean; parentId?: string | null } | null>(null);
  const [addRelOpen, setAddRelOpen] = useState(false);

  const handleOverlayCategoryChange = useCallback((cat: OverlayCategory) => {
    setOverlayCategory(cat);
    if (cat === 'none') {
      setMetricOverlay('none');
    } else {
      setMetricOverlay(OVERLAY_CATEGORY_DEFAULTS[cat]);
    }
  }, []);

  // リポジトリ切替時は overlay 関連の選択を初期化する
  // （前のリポジトリ向けの選択が新リポジトリで無効になり、ユーザーに混乱を与えるため）
  useEffect(() => {
    setOverlayCategory('none');
    setMetricOverlay('none');
  }, [selectedRepo]);



  const handleElementSelect = useCallback((id: string) => {
    setCenterOnSelect(true);
    setSelectedElementId(id);
  }, []);

  const handleAddElement = useCallback((data: ElementFormData) => {
    onAddElement?.(data);
  }, [onAddElement]);

  const handleUpdateElement = useCallback((data: ElementFormData) => {
    if (!editElement) return;
    onUpdateElement?.(editElement.id, data);
    setEditElement(null);
  }, [editElement, onUpdateElement]);

  const handleAddRelationship = useCallback((data: RelationshipFormData) => {
    onAddRelationship?.(data);
  }, [onAddRelationship]);

  const handleDeleteElement = useCallback((elementId: string) => {
    if (!c4Model) return;
    const elem = c4Model.elements.find(e => e.id === elementId);
    if (elem?.manual) {
      onRemoveElement?.(elementId);
      if (selectedElementId === elementId) setSelectedElementId(null);
    }
    setContextMenu(null);
  }, [c4Model, onRemoveElement, selectedElementId]);

  const selectedSystemId = useMemo(() => {
    if (!selectedElementId || !c4Model) return null;
    const elem = c4Model.elements.find(e => e.id === selectedElementId);
    return elem?.type === 'system' ? elem.id : null;
  }, [selectedElementId, c4Model]);

  useEffect(() => {
    if (!c4Model) return;

    const currentDrillRoot = drillStack.at(-1)?.element ?? null;
    let filteredModel = currentDrillRoot
      ? filterModelForDrill(c4Model, currentDrillRoot.id)
      : c4Model;

    if (checkedPackageIds) {
      const excluded = new Set<string>();
      for (const elem of filteredModel.elements) {
        if (FILTER_CHECKABLE_TYPES.has(elem.type as 'container') && !checkedPackageIds.has(elem.id)) {
          excluded.add(elem.id);
          for (const id of collectDescendantIds(filteredModel.elements, elem.id)) {
            excluded.add(id);
          }
        }
      }
      if (excluded.size > 0) {
        filteredModel = {
          ...filteredModel,
          elements: filteredModel.elements.filter(e => !excluded.has(e.id)),
          relationships: filteredModel.relationships.filter(
            r => !excluded.has(r.from) && !excluded.has(r.to),
          ),
        };
      }
    }

    // soloFrameId フィルタ: フレームとその全子孫のみ表示
    if (soloFrameId) {
      const keepIds = new Set<string>([soloFrameId]);
      for (const id of collectDescendantIds(filteredModel.elements, soloFrameId)) {
        keepIds.add(id);
      }
      filteredModel = {
        ...filteredModel,
        elements: filteredModel.elements.filter(e => keepIds.has(e.id)),
        relationships: filteredModel.relationships.filter(
          r => keepIds.has(r.from) && keepIds.has(r.to),
        ),
      };
    }

    const doc = c4ToGraphDocument(filteredModel, boundaryInfos, manualGroups);
    layoutWithSubgroups(doc, 'TB', 180, 60);
    setFullDoc(doc);
    let viewDoc = currentLevel < 4 || !showAncestorEdges
      ? (() => {
        const v = buildLevelView(doc, currentLevel, { showAncestorEdges });
        layoutWithSubgroups(v, 'TB', 180, 60);
        return v;
      })()
      : doc;

    // L1/L2/L3/L4 切り替え時に Fit を実行する。
    // viewport を doc に埋め込んで SET_DOCUMENT で確実に適用する（別途 SET_VIEWPORT を
    // 発行すると後続の SET_DOCUMENT で上書きされるため）。
    // setFullDoc() によるstate更新がエフェクトを再実行させるため、
    // カウントダウン方式で複数回の実行に対応する（setTimeout は React スケジューラと競合する）。
    if (pendingFitCountRef.current > 0) {
      pendingFitCountRef.current--;
      const canvas = canvasRef.current;
      if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        const bounds = computeBounds(viewDoc.nodes);
        let viewport = fitToContent(canvas.clientWidth, canvas.clientHeight, bounds);
        // Drill Up 後: 全体フィットのスケールを維持しつつ、ターゲット要素を中央に寄せる
        const centerTarget = pendingCenterC4IdRef.current;
        if (centerTarget) {
          const targetNode = viewDoc.nodes.find(n => (n.metadata?.c4Id as string | undefined) === centerTarget);
          if (targetNode) {
            pendingCenterC4IdRef.current = null;
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

    dispatch({ type: 'SET_DOCUMENT', doc: viewDoc });
  }, [c4Model, boundaryInfos, drillStack, currentLevel, checkedPackageIds, soloFrameId, manualGroups, showAncestorEdges]);

  /** 右クリックメニューを表示する */
  const handleNodeContextMenu = useCallback(
    (c4Id: string, x: number, y: number) => {
      setContextMenu({ x, y, c4Id });
    },
    [],
  );

  /** コンテキストメニューを閉じる */
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  /** フレームのみ表示 */
  const handleShowOnlyFrame = useCallback((c4Id: string) => {
    setSoloFrameId(c4Id);
    setContextMenu(null);
  }, []);

  /** 要素のパスをクリップボードにコピーする */
  const handleCopyPath = useCallback(() => {
    if (!contextMenu) return;
    const id = contextMenu.c4Id;
    let path: string;
    if (id.startsWith('pkg_')) {
      // pkg_web-app → packages/web-app
      // pkg_web-app/engine → packages/web-app/src/engine
      const inner = id.slice(4);
      const slash = inner.indexOf('/');
      if (slash === -1) {
        path = `packages/${inner}`;
      } else {
        path = `packages/${inner.slice(0, slash)}/src/${inner.slice(slash + 1)}`;
      }
    } else if (id.startsWith('file::')) {
      // file::packages/web-app/src/index.ts → packages/web-app/src/index.ts
      const withoutPrefix = id.slice(6);
      const colonIdx = withoutPrefix.indexOf('::');
      path = colonIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, colonIdx);
    } else {
      path = id;
    }
    navigator.clipboard.writeText(path).catch(() => {});
    setContextMenu(null);
  }, [contextMenu])

  const handleOpenFile = useCallback(() => {
    if (!contextMenu) return;
    const id = contextMenu.c4Id;
    // file::packages/web-app/src/index.ts → packages/web-app/src/index.ts
    const withoutPrefix = id.slice(6);
    const colonIdx = withoutPrefix.indexOf('::');
    const filePath = colonIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, colonIdx);
    onOpenFile?.(filePath);
    setContextMenu(null);
  }, [contextMenu, onOpenFile]);

  /** フレームフィルタを解除する */
  const handleClearFrameFilter = useCallback(() => {
    setSoloFrameId(null);
    setContextMenu(null);
  }, []);

  /** ドリルダウン時に子要素が見えるよう最低限必要なレベルを返す */
  const drillTargetLevel = useCallback((type: string): number => {
    if (type === 'system') return 2;
    if (type === 'container') return 3;
    return 4;
  }, []);

  const handleDrillDown = useCallback(
    (c4Id: string) => {
      if (!c4Model) return;
      const element = c4Model.elements.find(e => e.id === c4Id);
      if (element) {
        const prevLevel = currentLevel;
        const minLevel = drillTargetLevel(element.type);
        setDrillStack((prev) => [...prev, { element, prevLevel, prevCheckedIds: checkedPackageIds }]);
        if (currentLevel < minLevel) {
          setCurrentLevel(minLevel);
        }
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
        setCheckedPackageIds(null);
        setCheckReset(prev => ({ key: prev.key + 1, ids: inScope, expanded: expandIds }));
      }
      setSelectedElementId(null);
      setSelectedElementIds([]);
      setSoloFrameId(null);
      setContextMenu(null);
    },
    [c4Model, currentLevel, drillTargetLevel, checkedPackageIds],
  );

  const handleDrillUp = useCallback(() => {
    const entry = drillStack.at(-1);
    if (entry?.prevLevel !== undefined) setCurrentLevel(entry.prevLevel);
    // Drill Up 後、元の drill 起点要素を画面中央にセンタリングする
    if (entry) {
      pendingCenterC4IdRef.current = entry.element.id;
      pendingFitCountRef.current = 5;
    }
    setDrillStack((prev) => prev.slice(0, -1));
    setCheckedPackageIds(null);
    setCheckReset(prev => ({ key: prev.key + 1, ids: entry?.prevCheckedIds ?? null, expanded: null }));
    setSoloFrameId(null);
    setContextMenu(null);
  }, [drillStack]);

  const handleSetLevel = useCallback((level: number) => {
    pendingFitCountRef.current = 5;
    setCurrentLevel(level);
    setDrillStack([]);
    setCheckedPackageIds(null);
    setCheckReset(prev => ({ key: prev.key + 1, ids: null, expanded: null }));
    if (level <= 2) {
      setDsmLevel('package');
    } else {
      setDsmLevel('component');
    }
  }, []);

  const handleFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = computeBounds(state.document.nodes);
    const viewport = fitToContent(canvas.clientWidth, canvas.clientHeight, bounds);
    dispatch({ type: 'SET_VIEWPORT', viewport });
  }, [state.document.nodes]);


  const elementTree = useMemo(() => {
    if (!c4Model) return [];
    const fullTree = buildElementTree(c4Model, boundaryInfos);
    return filterTreeByLevel(fullTree, currentLevel);
  }, [c4Model, boundaryInfos, currentLevel]);

  const [checkReset, setCheckReset] = useState<{
    readonly key: number;
    readonly ids: ReadonlySet<string> | null;
    readonly expanded: ReadonlySet<string> | null;
  }>({ key: 0, ids: null, expanded: null });

  const deletedIds = useMemo(() => {
    if (!c4Model) return undefined;
    const ids = new Set<string>();
    for (const el of c4Model.elements) {
      if (el.deleted) ids.add(el.id);
    }
    return ids.size > 0 ? ids : undefined;
  }, [c4Model]);

  const filteredDsmMatrix = useMemo(() => {
    if (!dsmMatrix) return null;
    let m = dsmMatrix;
    if (currentLevel === 1 && c4Model) {
      m = aggregateDsmToC4SystemLevel(dsmMatrix, c4Model.elements);
    } else if (currentLevel === 2 && c4Model) {
      m = aggregateDsmToC4ContainerLevel(dsmMatrix, c4Model.elements);
    } else if (currentLevel === 3 && c4Model) {
      m = aggregateDsmToC4ComponentLevel(dsmMatrix, c4Model.elements);
    }
    m = sortDsmMatrixByName(m);
    if (checkedPackageIds) {
      if (currentLevel === 4 && c4Model) {
        // L4 では DSM ノードがファイル（code 要素）のため、
        // checkedPackageIds に含まれるコンテナ/コンポーネント ID を
        // その配下のファイル ID へ展開してからフィルタリングする。
        const elementById = new Map(c4Model.elements.map(e => [e.id, e]));
        const fileIdsToKeep = new Set<string>();
        for (const node of m.nodes) {
          let current = elementById.get(node.id);
          while (current) {
            if (checkedPackageIds.has(current.id)) {
              fileIdsToKeep.add(node.id);
              break;
            }
            if (!current.boundaryId) break;
            current = elementById.get(current.boundaryId);
          }
        }
        m = filterDsmMatrix(m, fileIdsToKeep);
      } else {
        m = filterDsmMatrix(m, checkedPackageIds);
      }
    }
    return m;
  }, [dsmMatrix, currentLevel, c4Model, checkedPackageIds]);

  // 要素選択 popup の DSM In/Out 表示用。dsmMatrix を 4 レベルすべてに集約して
  // 要素 ID → {in, out} の Map を作成する。currentLevel に依存しないため、
  // 異なるレベルの要素を選択しても DSM オーバーレイ着色と一貫したカウントを返せる。
  const dsmDegreeMap = useMemo<ReadonlyMap<string, { readonly in: number; readonly out: number }> | null>(() => {
    if (!dsmMatrix || !c4Model) return null;
    const map = new Map<string, { in: number; out: number }>();
    const fillFromMatrix = (m: DsmMatrix) => {
      for (let i = 0; i < m.nodes.length; i++) {
        const out = m.adjacency[i].reduce((s: number, v: number) => s + (v > 0 ? 1 : 0), 0);
        const inDeg = m.adjacency.reduce((s: number, row: readonly number[]) => s + (row[i] > 0 ? 1 : 0), 0);
        map.set(m.nodes[i].id, { in: inDeg, out });
      }
    };
    // L4 (code) は dsmMatrix がそのままファイル単位なのでそのまま使う
    fillFromMatrix(dsmMatrix);
    fillFromMatrix(aggregateDsmToC4ComponentLevel(dsmMatrix, c4Model.elements));
    fillFromMatrix(aggregateDsmToC4ContainerLevel(dsmMatrix, c4Model.elements));
    fillFromMatrix(aggregateDsmToC4SystemLevel(dsmMatrix, c4Model.elements));
    return map;
  }, [dsmMatrix, c4Model]);

  // importanceMatrix は WebSocket でリポジトリ非依存に push されるため、
  // 現在の c4Model.elements とキーが一致するかでデータの有無を判定する
  const hasImportanceData = useMemo(() => {
    if (!importanceMatrix || !c4Model) return false;
    const ids = new Set(c4Model.elements.map((e) => e.id));
    return Object.keys(importanceMatrix).some((id) => ids.has(id));
  }, [importanceMatrix, c4Model]);

  // sizeMatrix は isCategoryDataAvailable の依存配列で参照するため先に宣言する
  const sizeMatrix = useMemo<SizeMatrix | null>(() => {
    if (!fileAnalysisEntries || fileAnalysisEntries.length === 0 || !c4Model) return null;
    const sizeEntries = fileAnalysisEntries
      .filter((r) => r.lineCount > 0)
      .map((r) => ({
        elementId: `file::${r.filePath}`,
        lineCount: r.lineCount,
        functionCount: r.functionCount,
      }));
    if (sizeEntries.length === 0) return null;
    return buildSizeMatrix(sizeEntries, c4Model.elements);
  }, [fileAnalysisEntries, c4Model]);

  const isCategoryDataAvailable = useMemo(() => {
    // 空 entries / 空 nodes も「データなし」として扱う（サーバーが空マトリクスを返すケースに備える）
    if (overlayCategory === 'coverage') return !!coverageMatrix && coverageMatrix.entries.length > 0;
    if (overlayCategory === 'dsm') return !!filteredDsmMatrix && filteredDsmMatrix.nodes.length > 0;
    if (overlayCategory === 'edit-complexity') return !!complexityMatrix && complexityMatrix.entries.length > 0;
    if (overlayCategory === 'importance') return hasImportanceData;
    if (overlayCategory === 'hotspot') {
      if (!hotspotResponse) return true;
      return hotspotResponse.files.length > 0;
    }
    // size: dead-code と同様に常に true。個別 MenuItem の disabled={!sizeMatrix} で制御する
    return true;
  }, [overlayCategory, coverageMatrix, filteredDsmMatrix, complexityMatrix, hasImportanceData, hotspotResponse]);

  useEffect(() => {
    // hotspot は空応答時に metricOverlay をリセットすると useHotspot が disable され
    // hotspotResponse=null に戻り isCategoryDataAvailable が true へ揺り戻すループになるため除外
    if (!isCategoryDataAvailable && overlayCategory !== 'hotspot') {
      setMetricOverlay('none');
    }
  }, [isCategoryDataAvailable, overlayCategory]);

  const elementTypeById = useMemo<ReadonlyMap<string, string>>(
    () => new Map((c4Model?.elements ?? []).map((e) => [e.id, e.type])),
    [c4Model],
  );

  // L1=Context(system), L2=Container(container), L3=Component(component), L4=Code(code)
  const levelTargetType = useMemo(() => {
    return currentLevel === 1 ? 'system'
      : currentLevel === 2 ? 'container'
      : currentLevel === 3 ? 'component'
      : 'code';
  }, [currentLevel]);

  const levelFilteredImportanceMatrix = useMemo(() => {
    if (!importanceMatrix || !c4Model) return importanceMatrix ?? null;
    const filtered: ImportanceMatrix = {};
    for (const [id, score] of Object.entries(importanceMatrix)) {
      if (elementTypeById.get(id) === levelTargetType) filtered[id] = score;
    }
    return filtered;
  }, [importanceMatrix, c4Model, elementTypeById, levelTargetType]);

  const levelFilteredComplexityMatrix = useMemo(() => {
    if (!complexityMatrix || !c4Model) return complexityMatrix ?? null;
    const entries = complexityMatrix.entries.filter((e) => elementTypeById.get(e.elementId) === levelTargetType);
    return { ...complexityMatrix, entries };
  }, [complexityMatrix, c4Model, elementTypeById, levelTargetType]);

  // currentLevel に合わせて coverage エントリを対象タイプに絞る（boundary 除外）
  const levelFilteredCoverageMatrix = useMemo(() => {
    if (!coverageMatrix || !c4Model) return coverageMatrix ?? null;
    const targetType = currentLevel === 2 ? 'container'
      : currentLevel === 3 ? 'component'
      : 'code';
    const typeById = new Map(c4Model.elements.map((e) => [e.id, e.type]));
    const entries = coverageMatrix.entries.filter((e) => typeById.get(e.elementId) === targetType);
    return { ...coverageMatrix, entries };
  }, [coverageMatrix, c4Model, currentLevel]);

  const defectRiskMap = useMemo<ReadonlyMap<string, number> | null>(() => {
    if (drEntries.length === 0 || !c4Model) return null;
    const elementById = buildC4ElementById(c4Model.elements);
    const map = new Map<string, number>();
    for (const entry of drEntries) {
      for (const m of mapFileToC4Elements(entry.filePath, elementById)) {
        map.set(m.elementId, Math.max(map.get(m.elementId) ?? 0, entry.score));
      }
    }
    return map;
  }, [drEntries, c4Model]);

  const levelFilteredDefectRiskMap = useMemo<ReadonlyMap<string, number> | null>(() => {
    if (!defectRiskMap || !c4Model) return defectRiskMap;
    const filtered = new Map<string, number>();
    for (const [id, score] of defectRiskMap) {
      if (elementTypeById.get(id) === levelTargetType) filtered.set(id, score);
    }
    return filtered;
  }, [defectRiskMap, c4Model, elementTypeById, levelTargetType]);

  const hotspotMap = useMemo<HotspotMap | null>(() => {
    if (!hotspotResponse || !c4Model) return null;
    const fileHotspots = computeFileHotspot(hotspotResponse.files);
    return aggregateHotspotToC4(fileHotspots, c4Model, complexityMatrix ?? null);
  }, [hotspotResponse, c4Model, complexityMatrix]);

  const levelFilteredHotspotMap = useMemo<HotspotMap | null>(() => {
    if (!hotspotMap || !c4Model) return hotspotMap;
    const filtered = new Map<string, ReturnType<HotspotMap['get']> & object>();
    for (const [id, entry] of hotspotMap) {
      if (entry && elementTypeById.get(id) === levelTargetType) filtered.set(id, entry);
    }
    return filtered;
  }, [hotspotMap, c4Model, elementTypeById, levelTargetType]);

  // dead-code-score も importance と同じく現在表示レベルの要素タイプにのみ
  // 着色する（boundary フレームに色が伝播するのを防ぐ）
  const levelFilteredDeadCodeMatrix = useMemo<Record<string, number> | null>(() => {
    if (!deadCodeMatrix || !c4Model) return deadCodeMatrix ?? null;
    const filtered: Record<string, number> = {};
    for (const [id, score] of Object.entries(deadCodeMatrix)) {
      if (elementTypeById.get(id) === levelTargetType) filtered[id] = score;
    }
    return filtered;
  }, [deadCodeMatrix, c4Model, elementTypeById, levelTargetType]);

  // サイズメトリクス (LOC / files / functions) — sizeMatrix は上で宣言済み
  const levelFilteredSizeMatrix = useMemo<SizeMatrix | null>(() => {
    if (!sizeMatrix || !c4Model) return sizeMatrix;
    const filtered: SizeMatrix = {};
    for (const [id, entry] of Object.entries(sizeMatrix)) {
      if (elementTypeById.get(id) === levelTargetType) filtered[id] = entry;
    }
    return filtered;
  }, [sizeMatrix, c4Model, elementTypeById, levelTargetType]);

  const overlayMap = useMemo(
    () => computeColorMap(metricOverlay, levelFilteredCoverageMatrix, filteredDsmMatrix, levelFilteredComplexityMatrix, levelFilteredImportanceMatrix, levelFilteredDefectRiskMap, levelFilteredHotspotMap, levelFilteredDeadCodeMatrix, levelFilteredSizeMatrix),
    [metricOverlay, levelFilteredCoverageMatrix, filteredDsmMatrix, levelFilteredComplexityMatrix, levelFilteredImportanceMatrix, levelFilteredDefectRiskMap, levelFilteredHotspotMap, levelFilteredDeadCodeMatrix, levelFilteredSizeMatrix],
  );

  const effectiveOverlayMap = overlayMap;

  // Community overlay: L3/L4 のみ。トグル ON かつ codeGraph が取得済みのときのみ計算する
  const communityOverlay = useMemo<ReadonlyMap<string, CommunityOverlayEntry> | null>(() => {
    if (!showCommunity || !codeGraph || !c4Model) return null;
    if (currentLevel !== 3 && currentLevel !== 4) return null;
    return computeCommunityOverlay(c4Model, codeGraph, currentLevel as 3 | 4, selectedRepo || null);
  }, [showCommunity, codeGraph, c4Model, currentLevel, selectedRepo]);

  // Community タブ用: showCommunity トグル不要、L2/L3/L4 で常に L3 ベースで計算
  const communityOverlayL3 = useMemo<ReadonlyMap<string, CommunityOverlayEntry> | null>(() => {
    if (!codeGraph || !c4Model) return null;
    if (currentLevel === 1) return null;
    return computeCommunityOverlay(c4Model, codeGraph, 3, selectedRepo || null);
  }, [codeGraph, c4Model, currentLevel, selectedRepo]);

  // 情報パネル用 L4 オーバーレイ: code 要素選択時に community を解決するために必要。
  // showCommunity トグルとは独立に C2/C3/C4 で常に計算する（パネル描画はトグルに依存しない）。
  const communityOverlayL4 = useMemo<ReadonlyMap<string, CommunityOverlayEntry> | null>(() => {
    if (!codeGraph || !c4Model) return null;
    if (currentLevel === 1) return null;
    return computeCommunityOverlay(c4Model, codeGraph, 4, selectedRepo || null);
  }, [codeGraph, c4Model, currentLevel, selectedRepo]);

  const communityTree = useMemo(() => {
    if (!communityOverlayL3 || !codeGraph || !c4Model) return undefined;
    const maxDepth = currentLevel === 2 ? 'container' : currentLevel === 3 ? 'component' : 'code';
    return buildCommunityTree({
      c4Model,
      communityOverlay: communityOverlayL3,
      communities: codeGraph.communities,
      communitySummaries: codeGraph.communitySummaries,
      maxDepth,
    });
  }, [communityOverlayL3, codeGraph, c4Model, currentLevel]);

  const selectedCommunityInfo = useMemo(() => {
    if (!selectedElementId?.startsWith('community:')) return null;
    const cid = Number.parseInt(selectedElementId.slice('community:'.length), 10);
    if (Number.isNaN(cid)) return null;
    const node = communityTree?.find(n => n.communityId === cid) ?? null;
    if (!node) return null;
    const summary = codeGraph?.communitySummaries?.[cid];
    const fallbackLabel = codeGraph?.communities[cid];
    return {
      cid,
      displayName: summary?.name ?? fallbackLabel ?? `#${cid}`,
      color: communityColor(cid),
      nodeCount: node.nodeCount ?? 0,
      summaryText: summary?.summary ?? node.description,
      children: node.children,
    };
  }, [selectedElementId, communityTree, codeGraph]);

  const communityOverlayRef = useRef(communityOverlay);
  communityOverlayRef.current = communityOverlay;
  const featureMatrixRef = useRef(featureMatrix);
  featureMatrixRef.current = featureMatrix;

  // Community パネルで community 選択時に、その community の Primary 要素を画面中央にセンタリング
  useEffect(() => {
    if (!selectedCommunityInfo) return;
    const overlay = communityOverlayRef.current;
    const fm = featureMatrixRef.current;
    if (!overlay || !fm) return;
    const cid = selectedCommunityInfo.cid;
    const featureId = `f_community_${cid}`;
    let primaryC4Id: string | null = null;
    let firstC4Id: string | null = null;
    for (const [elementId, entry] of overlay) {
      if (entry.dominantCommunity !== cid) continue;
      if (firstC4Id === null) firstC4Id = elementId;
      const role = fm.mappings.find(
        m => m.featureId === featureId && m.elementId === elementId,
      )?.role ?? null;
      if (role === 'primary') { primaryC4Id = elementId; break; }
    }
    const targetC4Id = primaryC4Id ?? firstC4Id;
    if (!targetC4Id) return;
    const doc = stateRef.current.document;
    const targetNode = doc.nodes.find(
      n => (n.metadata?.c4Id as string | undefined) === targetC4Id,
    );
    if (!targetNode) return;
    const canvas = canvasRef.current;
    if (!canvas || canvas.clientWidth === 0) return;
    const vp = doc.viewport;
    dispatch({
      type: 'SET_VIEWPORT',
      viewport: {
        ...vp,
        offsetX: canvas.clientWidth / 2 - (targetNode.x + targetNode.width / 2) * vp.scale,
        offsetY: canvas.clientHeight / 2 - (targetNode.y + targetNode.height / 2) * vp.scale,
      },
    });
  }, [selectedCommunityInfo, dispatch, canvasRef]);

  const communityMap = useMemo(() => {
    if (!communityOverlay) return null;
    // community パネルで特定 community を選択中はそれ以外の塗りつぶしを除外する
    const filterCid = selectedCommunityInfo?.cid ?? null;
    const map = new Map<string, { color: string; isGodNode: boolean }>();
    for (const [elementId, entry] of communityOverlay) {
      if (filterCid !== null && entry.dominantCommunity !== filterCid) continue;
      map.set(elementId, { color: communityColor(entry.dominantCommunity), isGodNode: entry.isGodNode });
    }
    return map.size > 0 ? map : null;
  }, [communityOverlay, selectedCommunityInfo]);

  // community ON 時に各ノードへ P/S/D バッジラベルをマップする
  const communityRoleBadgeMap = useMemo<ReadonlyMap<string, string> | null>(() => {
    if (!communityOverlay || !featureMatrix) return null;
    const filterCid = selectedCommunityInfo?.cid ?? null;
    const map = new Map<string, string>();
    for (const [elementId, entry] of communityOverlay) {
      if (filterCid !== null && entry.dominantCommunity !== filterCid) continue;
      const featureId = `f_community_${entry.dominantCommunity}`;
      const role = featureMatrix.mappings.find(
        m => m.featureId === featureId && m.elementId === elementId,
      )?.role ?? null;
      if (role) {
        map.set(elementId, COMMUNITY_ROLE_LABELS[role as keyof typeof COMMUNITY_ROLE_LABELS] ?? role);
      }
    }
    return map.size > 0 ? map : null;
  }, [communityOverlay, featureMatrix, selectedCommunityInfo]);

  const communityLegend = useMemo<readonly CommunityLegendItem[] | null>(() => {
    if (!communityOverlay || !codeGraph) return null;
    const seen = new Set<number>();
    const items: CommunityLegendItem[] = [];
    for (const entry of communityOverlay.values()) {
      if (seen.has(entry.dominantCommunity)) continue;
      seen.add(entry.dominantCommunity);
      const summary = entry.communitySummary;
      const fallbackName = codeGraph.communities[entry.dominantCommunity];
      items.push({
        community: entry.dominantCommunity,
        color: communityColor(entry.dominantCommunity),
        name: summary?.name ?? fallbackName ?? `#${entry.dominantCommunity}`,
        summary: summary?.summary,
      });
    }
    // 同名ラベル重複時は曖昧性解消のためコミュニティ番号を付与する。
    // GraphClusterer のラベルは pkg_*/component の component 名で多数決するため、
    // 異なるパッケージが同じ component 名（"engine" 等）を持つと衝突しうる。
    const nameCount = new Map<string, number>();
    for (const item of items) nameCount.set(item.name, (nameCount.get(item.name) ?? 0) + 1);
    const disambiguated = items.map((item) =>
      (nameCount.get(item.name) ?? 0) > 1
        ? { ...item, name: `${item.name} #${item.community}` }
        : item,
    );
    disambiguated.sort((a, b) => a.community - b.community);
    return disambiguated.length > 0 ? disambiguated : null;
  }, [communityOverlay, codeGraph]);

  const claudeActivityMap = useMemo(() => {
    // マルチエージェントモード
    if (multiAgentActivity && multiAgentActivity.agents.length > 0) {
      const agentsForLevel = multiAgentActivity.agents.map((agent) => {
        if (!c4Model) return agent;
        return {
          ...agent,
          activeElementIds: agent.activeElementIds.filter((id) => elementTypeById.get(id) === levelTargetType),
          touchedElementIds: agent.touchedElementIds.filter((id) => elementTypeById.get(id) === levelTargetType),
          plannedElementIds: agent.plannedElementIds.filter((id) => elementTypeById.get(id) === levelTargetType),
        };
      });
      const hasAny = agentsForLevel.some((a) =>
        a.activeElementIds.length > 0 || a.touchedElementIds.length > 0 || a.plannedElementIds.length > 0);
      if (!hasAny) return null;
      return computeMultiAgentColorMap(agentsForLevel, isDark);
    }
    // 単一エージェントモード（後方互換）
    if (!claudeActivity) return null;
    const { activeElementIds, touchedElementIds, plannedElementIds } = claudeActivity;
    if (activeElementIds.length === 0 && touchedElementIds.length === 0 && plannedElementIds.length === 0) return null;
    if (c4Model) {
      const filteredActive = activeElementIds.filter((id) => elementTypeById.get(id) === levelTargetType);
      const filteredTouched = touchedElementIds.filter((id) => elementTypeById.get(id) === levelTargetType);
      const filteredPlanned = plannedElementIds.filter((id) => elementTypeById.get(id) === levelTargetType);
      if (filteredActive.length === 0 && filteredTouched.length === 0 && filteredPlanned.length === 0) return null;
      return computeClaudeActivityColorMap(filteredActive, filteredTouched, filteredPlanned, isDark);
    }
    return computeClaudeActivityColorMap(activeElementIds, touchedElementIds, plannedElementIds, isDark);
  }, [multiAgentActivity, claudeActivity, c4Model, elementTypeById, levelTargetType, isDark]);

  const conflictBorderMap = useMemo(() => {
    if (!multiAgentActivity?.conflicts?.length) return null;
    if (!c4Model) return computeConflictBorderMap(multiAgentActivity.conflicts);
    const filtered = multiAgentActivity.conflicts.map((c) => ({
      ...c,
      elementIds: c.elementIds.filter((id) => elementTypeById.get(id) === levelTargetType),
    })).filter((c) => c.elementIds.length > 0);
    if (filtered.length === 0) return null;
    return computeConflictBorderMap(filtered);
  }, [multiAgentActivity, c4Model, elementTypeById, levelTargetType]);

  const claudeActivityMapWithConflicts = useMemo(() => {
    if (!claudeActivityMap && !conflictBorderMap) return null;
    const map = new Map(claudeActivityMap ?? []);
    if (conflictBorderMap) {
      for (const [id, color] of conflictBorderMap) {
        map.set(id, color);
      }
    }
    return map.size > 0 ? map : null;
  }, [claudeActivityMap, conflictBorderMap]);

  const dsmMax = useMemo(() => {
    if ((metricOverlay !== 'dsm-out' && metricOverlay !== 'dsm-in') || !filteredDsmMatrix) return undefined;
    let max = 0;
    for (let i = 0; i < filteredDsmMatrix.nodes.length; i++) {
      const count = metricOverlay === 'dsm-out'
        ? filteredDsmMatrix.adjacency[i].reduce((s: number, v: number) => s + (v > 0 ? 1 : 0), 0)
        : filteredDsmMatrix.adjacency.reduce((s: number, row: readonly number[]) => s + (row[i] > 0 ? 1 : 0), 0);
      if (count > max) max = count;
    }
    return max;
  }, [metricOverlay, filteredDsmMatrix]);

  const excludedDescendantIds = useMemo(() => {
    if (!c4Model || !checkedPackageIds) return null;
    const excluded = new Set<string>();
    for (const elem of c4Model.elements) {
      const isCheckable = FILTER_CHECKABLE_TYPES.has(elem.type as 'container');
      if (isCheckable && !checkedPackageIds.has(elem.id)) {
        const descendants = collectDescendantIds(c4Model.elements, elem.id);
        for (const id of descendants) excluded.add(id);
        excluded.add(elem.id);
      }
    }
    return excluded.size > 0 ? excluded : null;
  }, [c4Model, checkedPackageIds]);

  const selectedScopeIds = useMemo(() => {
    if (!c4Model || !selectedElementId) return null;
    const selectedElement = c4Model.elements.find(e => e.id === selectedElementId);
    const isBoundary = boundaryInfos.some(b => b.id === selectedElementId);
    const isContainer = selectedElement && (selectedElement.type === 'container' || selectedElement.type === 'containerDb');
    const isComponent = selectedElement && selectedElement.type === 'component';
    if (isBoundary || isContainer || isComponent) {
      return collectDescendantIds(c4Model.elements, selectedElementId);
    }
    return null;
  }, [c4Model, boundaryInfos, selectedElementId]);

  const selectedElementInfo = useMemo(() => {
    if (!c4Model || !selectedElementId) return null;
    const element = c4Model.elements.find(e => e.id === selectedElementId);
    if (!element) return null;
    // DSM In/Out は dsm-out / dsm-in オーバーレイと同じソース (dsmMatrix) を参照する。
    // 旧実装は c4Model.relationships を数えていたが、これは codeGraphToC4 が
    // 生成するレベル別 dedup 結果 + 手動 relationships で、DSM オーバーレイの
    // 着色値とずれていた (system レベルでは relationships 0 件、手動定義時は超過)。
    const dsmDegree = dsmDegreeMap?.get(element.id) ?? null;
    const incoming = dsmDegree?.in ?? null;
    const outgoing = dsmDegree?.out ?? null;
    const documents = (docLinks ?? []).filter(doc => matchesDocScope(doc.c4Scope, element.id));
    const coverage = coverageMatrix?.entries.find(entry => entry.elementId === element.id) ?? null;
    const complexity = complexityMatrix?.entries.find(entry => entry.elementId === element.id) ?? null;
    const importance = importanceMatrix?.[element.id] ?? null;
    const defectRisk = defectRiskMap?.get(element.id) ?? null;
    const hotspot = hotspotMap?.get(element.id) ?? null;
    const community = resolveSelectedElementCommunity({
      element,
      c4Model,
      communityOverlayL3,
      communityOverlayL4,
      communitySummaries: codeGraph?.communitySummaries,
    });
    // size overlay と同じソース (fileAnalysisEntries → sizeMatrix) を参照する。
    // coverage の lines.total は計測対象外ファイルで 0 になり overlay 着色と乖離するため使わない。
    const sizeEntry = sizeMatrix?.[element.id];
    const sizeMetrics = sizeEntry
      ? { loc: sizeEntry.loc, locMax: sizeEntry.locMax, fileCount: sizeEntry.files, functionCount: sizeEntry.functions }
      : { loc: null, locMax: null, fileCount: null, functionCount: null };
    return { element, incoming, outgoing, documents, coverage, complexity, importance, defectRisk, hotspot, community, sizeMetrics };
  }, [c4Model, complexityMatrix, coverageMatrix, defectRiskMap, hotspotMap, docLinks, importanceMatrix, selectedElementId, communityOverlayL3, communityOverlayL4, codeGraph, sizeMatrix, dsmDegreeMap]);

  const { data: elementFunctions, loading: elementFunctionsLoading } = useElementFunctions({
    serverUrl,
    elementId: selectedElementInfo?.element.type === 'code' ? selectedElementId : null,
    enabled: selectedElementInfo?.element.type === 'code' && !!selectedElementId,
  });

  const toolbarButtonSx = {
    textTransform: 'none', color: colors.accent, borderColor: colors.border,
    fontWeight: 600, fontSize: '0.875rem', borderRadius: '8px',
    transition: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { bgcolor: colors.hover },
    '&:focus-visible': { outline: `2px solid ${colors.accent}`, outlineOffset: '2px' },
    '&:disabled': { color: colors.textMuted },
  } as const;

  const toolbarButtonActiveBg = colors.focus;

  const levelButtonSx = {
    textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', minWidth: 36,
    borderColor: colors.border, color: colors.textSecondary,
    transition: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { bgcolor: colors.hover },
    '&:focus-visible': { outline: `2px solid ${colors.accent}`, outlineOffset: '2px' },
  } as const;

  const levelButtonActiveSx = {
    ...levelButtonSx,
    bgcolor: `${colors.accent} !important`,
    color: isDark ? `${colors.bg} !important` : '#fff !important',
    borderColor: `${colors.accent} !important`,
  } as const;

  // コンテキストメニュー表示時の capability 計算は contextMenuCapabilities.ts に集約。
  // ドメイン判定は graph node.type ではなく c4Model から解決し、レイヤー混同を避ける。
  const {
    canDrillDown,
    canDrillUp,
    canShowOnlyFrame,
    canCopyPath,
    canOpenFile,
    canShowSequence,
    canShowManualActions,
    showContextMenu,
  } = computeContextMenuCapabilities({
    c4Model,
    c4Id: contextMenu?.c4Id ?? null,
    drillStack,
    hasShowSequenceHandler: onShowSequence !== undefined,
    canShowManualContextActions,
    levelTargetType,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: containerHeight, bgcolor: colors.bg }}>
      {analysisProgress && (
        <Box
          role="dialog"
          aria-label="Analysis in progress"
          aria-live="polite"
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: LOADING_OVERLAY_BG,
            backdropFilter: 'blur(4px)',
          }}
        >
          <Box sx={{
            bgcolor: colors.bgSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: 2,
            px: 4,
            py: 3,
            minWidth: 360,
            maxWidth: 480,
            textAlign: 'center',
          }}>
            <Typography variant="subtitle1" sx={{ color: colors.text, fontWeight: 600, mb: 1 }}>
              Analyzing Workspace
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 2 }}>
              {analysisProgress.phase}
            </Typography>
            <LinearProgress
              variant={analysisProgress.percent >= 0 ? 'determinate' : 'indeterminate'}
              value={analysisProgress.percent >= 0 ? analysisProgress.percent : undefined}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: colors.hover,
                '& .MuiLinearProgress-bar': { bgcolor: colors.accent, borderRadius: 3 },
              }}
            />
            <Typography variant="caption" sx={{ color: colors.textMuted, mt: 1, display: 'block' }}>
              {analysisProgress.percent >= 0 ? `${analysisProgress.percent}%` : ''}
            </Typography>
          </Box>
        </Box>
      )}
      <Box ref={containerRef} sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 要素ツリーパネル（左側固定表示） */}
        {elementTree.length > 0 && (
          <C4ElementTree
            tree={elementTree}
            dispatch={dispatch}
            onSelect={handleElementSelect}
            repoOptions={repoOptions}
            selectedRepo={selectedRepo}
            onRepoChange={handleRepoChange}
            releaseOptions={visibleReleases}
            selectedRelease={selectedRelease}
            onReleaseChange={handleReleaseChange}
            currentLevel={currentLevel}
            selectedSystemId={selectedSystemId}
            onAddElement={(type) => setAddElementType(type)}
            onCheckedChange={setCheckedPackageIds}
            checkReset={checkReset}
            onRemoveElement={onRemoveElement}
            onPurgeDeleted={onPurgeDeleted}
            isDark={isDark}
            communityTree={communityTree}
            communityLoading={codeGraphLoading && !codeGraph}
            onCommunityTabOpen={() => setCodeGraphEnabled(true)}
          />
        )}
        {/* C4 Graph */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 100, position: 'relative' }}>
            <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <GraphCanvas
                isDark={isDark}
                document={state.document}
                viewport={state.document.viewport}
                dispatch={dispatch}
                canvasRef={canvasRef}
                selectedNodeId={selectedElementId ? (state.document.nodes.find(n => n.metadata?.c4Id === selectedElementId)?.id ?? null) : null}
                centerOnSelect={centerOnSelect}
                overlayMap={effectiveOverlayMap.size > 0 ? effectiveOverlayMap : null}
                claudeActivityMap={claudeActivityMapWithConflicts}
                communityMap={communityMap}
                communityRoleBadgeMap={communityRoleBadgeMap}
                ghostEdges={
                  tcValue.enabled && (currentLevel === 3 || currentLevel === 4)
                    ? ghostEdges.map((e) => ({
                      source: e.source,
                      target: e.target,
                      jaccard: e.jaccard,
                      direction: e.direction,
                      confidenceForward: e.confidenceForward,
                    }))
                    : undefined
                }
                ghostEdgeGranularity={tcGranularity}
                onNodeSelect={(id) => { setCenterOnSelect(false); setSelectedElementId(id); setSelectedElementIds([]); }}
                onMultiNodeSelect={(ids) => {
                  if (ids.length === 1) {
                    setSelectedElementId(ids[0]);
                    setSelectedElementIds([]);
                  } else if (ids.length === 0) {
                    setSelectedElementId(null);
                    setSelectedElementIds([]);
                  } else {
                    setSelectedElementId(null);
                    setSelectedElementIds(ids);
                  }
                }}
                onNodeDoubleClick={(nodeId) => {
                  if (!c4Model) return;
                  const elem = c4Model.elements.find(e => e.id === nodeId);
                  const editableTypes: readonly string[] = ['person', 'system', 'container', 'component'];
                  if (elem?.manual && editableTypes.includes(elem.type)) {
                    setEditElement({ id: elem.id, type: elem.type as C4ElementKind, name: elem.name, description: elem.description ?? '', external: elem.external ?? false });
                  }
                }}
                onNodeContextMenu={handleNodeContextMenu}
              />
              {/* 左側パネル: 全体マップ + C4 ビュー設定コントロール群 */}
              <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* 全体マップ（ミニマップ） */}
                <MinimapCanvas
                  nodes={state.document.nodes}
                  viewport={state.document.viewport}
                  mainCanvasRef={canvasRef}
                  onViewportChange={(vp) => dispatch({ type: 'SET_VIEWPORT', viewport: vp })}
                  isDark={isDark}
                  onFit={handleFit}
                  containerStyle={{ position: 'static', width: 220 }}
                />
                {/* メインコントロールパネル */}
                <Box
                  role="group"
                  aria-label="C4 ビュー設定"
                  sx={{
                    width: 220,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    bgcolor: colors.popupBg,
                    boxShadow: POPUP_SHADOW,
                    backdropFilter: 'blur(10px)',
                    px: 1.5,
                    py: 1.25,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                  }}
                >
                  {/* L1/L2/L3/L4 */}
                  <Box>
                    <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.65rem', mb: 0.5 }}>
                      C4 Level
                    </Typography>
                    <ButtonGroup size="small" fullWidth>
                      {([1, 2, 3, 4] as const).map(level => (
                        <Button
                          key={level}
                          onClick={() => handleSetLevel(level)}
                          aria-pressed={currentLevel === level}
                          aria-label={`Level ${level}: ${({ 1: 'Context', 2: 'Container', 3: 'Component', 4: 'Code' } as const)[level]}`}
                          title={({ 1: 'Context', 2: 'Container', 3: 'Component', 4: 'Code' } as const)[level]}
                          sx={currentLevel === level ? levelButtonActiveSx : levelButtonSx}
                        >
                          C{level}
                        </Button>
                      ))}
                    </ButtonGroup>
                  </Box>
                  {/* Community / Ghost Edges / Activity Trend / Upper Lines — アイコン横並び */}
                  <Box sx={{ display: 'flex', flexDirection: 'row', gap: 0.5 }}>
                    {/* Community */}
                    <Tooltip title={currentLevel < 3 ? t('c4.community.disabledLevel') : showCommunity && !codeGraph ? t('c4.community.disabledNoData') : t('c4.community.toggle')}>
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => setShowCommunity(prev => !prev)}
                          disabled={currentLevel < 3 || (showCommunity && !codeGraph)}
                          aria-pressed={showCommunity}
                          aria-label={t('c4.community.toggle')}
                          sx={{
                            ...toolbarButtonSx,
                            ...(showCommunity && currentLevel >= 3 && { bgcolor: toolbarButtonActiveBg }),
                          }}
                        >
                          <GroupWorkIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    {/* Ghost Edges */}
                    <Tooltip title="Ghost Edges">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setTcValue(prev => {
                            const nextMode = prev.enabled ? 'none' : prev.granularity === 'session' ? 'session' : 'commit';
                            return applyGhostEdgeMode(prev, nextMode);
                          });
                        }}
                        aria-pressed={tcValue.enabled}
                        aria-label="Ghost Edges"
                        sx={{
                          ...toolbarButtonSx,
                          ...(tcValue.enabled && { bgcolor: toolbarButtonActiveBg }),
                        }}
                      >
                        <TimelineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    {/* Activity Trend */}
                    <Tooltip title="Activity Trend">
                      <IconButton
                        size="small"
                        onClick={() => setShowActivityTrend(prev => !prev)}
                        aria-pressed={showActivityTrend}
                        aria-label="Toggle Activity Trend chart"
                        sx={{
                          ...toolbarButtonSx,
                          ...(showActivityTrend && { bgcolor: toolbarButtonActiveBg }),
                        }}
                      >
                        <TrendingUpIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    {/* Upper Lines */}
                    <Tooltip title="Upper Lines">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => setShowAncestorEdges(prev => !prev)}
                          disabled={currentLevel === 1}
                          aria-pressed={showAncestorEdges}
                          aria-label="Toggle upper C4 layer relationships"
                          sx={{
                            ...toolbarButtonSx,
                            ...(showAncestorEdges && currentLevel !== 1 && { bgcolor: toolbarButtonActiveBg }),
                          }}
                        >
                          <LayersIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    {/* Clear Edit History */}
                    <Tooltip title={t('c4.claudeActivity.reset')}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={
                            !(claudeActivity && (claudeActivity.activeElementIds.length > 0 || claudeActivity.touchedElementIds.length > 0 || claudeActivity.plannedElementIds.length > 0)) &&
                            !(multiAgentActivity && multiAgentActivity.agents.length > 0)
                          }
                          onClick={onResetClaudeActivity}
                          aria-label={t('c4.claudeActivity.reset')}
                          sx={toolbarButtonSx}
                        >
                          <DeleteSweepIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                  {/* Overlay ドロップダウン */}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, mb: 0.5 }}>
                      <Typography variant="caption" sx={{ color: colors.textMuted, fontSize: '0.65rem' }}>
                        {t('c4.overlay.label')}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        <Tooltip title={t('viewer.tab.graph')}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setShowGraphPopup(prev => {
                                const next = !prev;
                                if (next) setMatrixPopup(null);
                                return next;
                              });
                            }}
                            aria-pressed={showGraphPopup}
                            aria-label={t('viewer.tab.graph')}
                            sx={{
                              ...toolbarButtonSx,
                              p: 0.25,
                              ...(showGraphPopup && { bgcolor: toolbarButtonActiveBg }),
                            }}
                          >
                            <HubIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('viewer.tab.matrix')}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setMatrixPopup(prev => {
                                if (prev) return null;
                                setShowGraphPopup(false);
                                return { initialLevel: 'component', filterElementId: null };
                              });
                            }}
                            aria-pressed={showMatrixPopup}
                            aria-label={t('viewer.tab.matrix')}
                            sx={{
                              ...toolbarButtonSx,
                              p: 0.25,
                              ...(showMatrixPopup && { bgcolor: toolbarButtonActiveBg }),
                            }}
                          >
                            <TableChartIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                    <Select
                      size="small"
                      fullWidth
                      value={overlayCategory}
                      onChange={(e) => { handleOverlayCategoryChange(e.target.value as OverlayCategory); }}
                      sx={{ fontSize: '0.75rem', height: 28, '.MuiSelect-select': { py: 0, px: 1 } }}
                      aria-label={t('c4.overlay.label')}
                    >
                      <MenuItem value="none" sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.none')}</MenuItem>
                      <MenuItem value="dsm" disabled={!filteredDsmMatrix || filteredDsmMatrix.nodes.length === 0} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.groupDsm')}</MenuItem>
                      <MenuItem value="size" disabled={!sizeMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.groupSize')}</MenuItem>
                      <MenuItem value="coverage" disabled={!coverageMatrix || coverageMatrix.entries.length === 0} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.groupCoverage')}</MenuItem>
                      <MenuItem value="importance" disabled={!hasImportanceData} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.groupImportance')}</MenuItem>
                      <MenuItem value="edit-complexity" disabled={!complexityMatrix || complexityMatrix.entries.length === 0} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.groupEditComplexity')}</MenuItem>
                      <MenuItem value="dead-code" disabled={!deadCodeMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.groupDeadCode')}</MenuItem>
                      <MenuItem value="hotspot" sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.groupHotspot')}</MenuItem>
                    </Select>
                  </Box>
                  {overlayCategory !== 'none' && (
                    <Box>
                      <Select
                        size="small"
                        fullWidth
                        disabled={!isCategoryDataAvailable}
                        value={!isCategoryDataAvailable ? '' : metricOverlay}
                        onChange={(e) => {
                          setMetricOverlay(e.target.value as MetricOverlay);
                        }}
                        sx={{ fontSize: '0.75rem', height: 28, '.MuiSelect-select': { py: 0, px: 1 } }}
                        aria-label="overlay-sub"
                      >
                        {!isCategoryDataAvailable && (
                          <MenuItem value="" sx={{ fontSize: '0.75rem' }}>-</MenuItem>
                        )}
                        {overlayCategory === 'coverage' && isCategoryDataAvailable && [
                          <MenuItem key="lines" value="coverage-lines" disabled={!coverageMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.coverageLines')}</MenuItem>,
                          <MenuItem key="branches" value="coverage-branches" disabled={!coverageMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.coverageBranches')}</MenuItem>,
                          <MenuItem key="functions" value="coverage-functions" disabled={!coverageMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.coverageFunctions')}</MenuItem>,
                        ]}
                        {overlayCategory === 'dsm' && isCategoryDataAvailable && [
                          <MenuItem key="cyclic" value="dsm-cyclic" disabled={!filteredDsmMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.dsmCyclic')}</MenuItem>,
                          <MenuItem key="out" value="dsm-out" disabled={!filteredDsmMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.dsmOut')}</MenuItem>,
                          <MenuItem key="in" value="dsm-in" disabled={!filteredDsmMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.dsmIn')}</MenuItem>,
                        ]}
                        {overlayCategory === 'edit-complexity' && isCategoryDataAvailable && [
                          <MenuItem key="most" value="edit-complexity-most" disabled={!complexityMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.editComplexityMost')}</MenuItem>,
                          <MenuItem key="highest" value="edit-complexity-highest" disabled={!complexityMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.editComplexityHighest')}</MenuItem>,
                        ]}
                        {overlayCategory === 'importance' && [
                          <MenuItem key="importance" value="importance" disabled={!importanceMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.importance')}</MenuItem>,
                          <MenuItem key="defect-risk" value="defect-risk" sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.defectRisk')}</MenuItem>,
                        ]}
                        {overlayCategory === 'hotspot' && [
                          <MenuItem key="frequency" value="hotspot-frequency" sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.hotspotFrequency')}</MenuItem>,
                          <MenuItem key="risk" value="hotspot-risk" disabled={!complexityMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.hotspotRisk')}</MenuItem>,
                        ]}
                        {overlayCategory === 'dead-code' && [
                          <MenuItem key="dead-code-score" value="dead-code-score" disabled={!deadCodeMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.deadCodeScore')}</MenuItem>,
                        ]}
                        {overlayCategory === 'size' && [
                          <MenuItem key="size-loc" value="size-loc" disabled={!sizeMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.sizeLoc')}</MenuItem>,
                          <MenuItem key="size-files" value="size-files" disabled={!sizeMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.sizeFiles')}</MenuItem>,
                          <MenuItem key="size-functions" value="size-functions" disabled={!sizeMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.sizeFunctions')}</MenuItem>,
                        ]}
                      </Select>
                    </Box>
                  )}
                  <OverlayLegend
                    overlay={metricOverlay}
                    isDark={isDark}
                    dsmMax={dsmMax}
                    inline
                  />
                  <Box sx={{ borderTop: `1px solid ${colors.border}`, mx: -1.5 }} />
                  {soloFrameId !== null && (
                    <Button size="small" fullWidth startIcon={<FilterAltOffIcon sx={{ fontSize: 14 }} />} onClick={handleClearFrameFilter} sx={{ ...toolbarButtonSx, fontSize: '0.75rem', justifyContent: 'flex-start', color: colors.accent }}>
                      {t('c4.frameFilter.reset')}
                    </Button>
                  )}
                  {multiAgentActivity && multiAgentActivity.agents.length > 1 && (
                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.65rem' }}>
                      {multiAgentActivity.agents.length} {t('c4.multiAgent.badge')}
                      {multiAgentActivity.conflicts && multiAgentActivity.conflicts.length > 0 && (
                        <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'error.main', fontWeight: 'bold' }}>
                          {multiAgentActivity.conflicts.length} {t('c4.multiAgent.conflicts')}
                        </Typography>
                      )}
                    </Typography>
                  )}
                </Box>
                {/* Ghost Edges 詳細設定（有効時のみ表示） */}
                <TemporalCouplingSettingsPopup
                  value={tcValue}
                  onChange={setTcValue}
                  resultCount={ghostEdges.length}
                  loading={tcLoading}
                  isDark={isDark}
                  sx={{ position: 'static' }}
                />
                {/* Hotspot 詳細設定（オーバーレイ選択時 + データ有り時のみ表示） */}
                <HotspotControls
                  value={hotspotValue}
                  onChange={setHotspotValue}
                  loading={hotspotLoading}
                  isDark={isDark}
                  enabled={isHotspotOverlay && isCategoryDataAvailable}
                  sx={{ position: 'static' }}
                />
              </Box>
              {showMatrixPopup && (
                <ResizablePopup
                  title={t('viewer.tab.matrix')}
                  ariaLabel={t('viewer.tab.matrix')}
                  onClose={() => setMatrixPopup(null)}
                  isDark={isDark}
                  colors={colors}
                  size={matrixPopupSize}
                  onSizeChange={setMatrixPopupSize}
                  maximized={matrixPopupMaximized}
                  onMaximizedChange={setMatrixPopupMaximized}
                  toolbarButtonSx={toolbarButtonSx}
                  i18nMaximize={t('c4.popup.maximize')}
                  i18nRestore={t('c4.popup.restore')}
                  i18nClose={t('c4.popup.close')}
                  i18nResize={t('c4.popup.resize')}
                >
                  <MatrixPanel
                    key={`${matrixPopup?.initialLevel ?? 'component'}-${matrixPopup?.filterElementId ?? ''}`}
                    coverageMatrix={coverageMatrix}
                    complexityMatrix={complexityMatrix}
                    c4Model={c4Model}
                    serverUrl={serverUrl}
                    selectedRepo={selectedRepo}
                    selectedRelease={selectedRelease}
                    isDark={isDark}
                    isActive={showMatrixPopup}
                    isCommunityColor={showCommunity}
                    initialLevel={matrixPopup?.initialLevel ?? 'component'}
                    filterElementId={matrixPopup?.filterElementId ?? null}
                  />
                </ResizablePopup>
              )}
              {showGraphPopup && (
                <ResizablePopup
                  title={t('viewer.tab.graph')}
                  ariaLabel={t('viewer.tab.graph')}
                  onClose={() => setShowGraphPopup(false)}
                  isDark={isDark}
                  colors={colors}
                  size={graphPopupSize}
                  onSizeChange={setGraphPopupSize}
                  maximized={graphPopupMaximized}
                  onMaximizedChange={setGraphPopupMaximized}
                  toolbarButtonSx={toolbarButtonSx}
                  i18nMaximize={t('c4.popup.maximize')}
                  i18nRestore={t('c4.popup.restore')}
                  i18nClose={t('c4.popup.close')}
                  i18nResize={t('c4.popup.resize')}
                >
                  <Suspense fallback={<CodeGraphPanelSkeleton />}>
                    <CodeGraphPanel serverUrl={serverUrl} isDark={isDark} tcValue={tcValue} />
                  </Suspense>
                </ResizablePopup>
              )}
              {selectedElementIds.length > 1 && c4Model && (
                <Box
                  role="dialog"
                  aria-label="Multiple C4 elements selected"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: SELECTED_ELEMENT_DETAILS_WIDTH,
                    maxHeight: 'calc(100% - 20px)',
                    overflow: 'auto',
                    zIndex: 10,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    bgcolor: colors.popupBg,
                    color: colors.text,
                    boxShadow: POPUP_SHADOW,
                    backdropFilter: 'blur(10px)',
                    px: 1.5,
                    py: 1.25,
                  }}
                >
                  <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.65rem', textTransform: 'uppercase', mb: 0.75 }}>
                    {selectedElementIds.length} elements selected
                  </Typography>
                  {selectedElementIds.map(id => {
                    const elem = c4Model.elements.find(e => e.id === id);
                    if (!elem) return null;
                    return (
                      <Box key={id} sx={{ py: 0.5, borderBottom: `1px solid ${colors.border}`, '&:last-child': { borderBottom: 'none' } }}>
                        <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.6rem', textTransform: 'uppercase' }}>
                          {elem.type}
                        </Typography>
                        <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.8rem', fontWeight: 600, wordBreak: 'break-word' }}>
                          {elem.name}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}
              {selectedElementInfo && (
                <Box
                  role="dialog"
                  aria-label="Selected C4 element details"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: SELECTED_ELEMENT_DETAILS_WIDTH,
                    maxHeight: 'calc(100% - 20px)',
                    overflow: 'auto',
                    zIndex: 10,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    bgcolor: colors.popupBg,
                    color: colors.text,
                    boxShadow: POPUP_SHADOW,
                    backdropFilter: 'blur(10px)',
                    px: 1.5,
                    py: 1.25,
                  }}
                >
                  <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    {selectedElementInfo.element.type}
                  </Typography>
                  <Typography variant="subtitle2" sx={{ color: colors.text, fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.3, mt: 0.25, wordBreak: 'break-word' }}>
                    {selectedElementInfo.element.name}
                  </Typography>
                  {selectedElementInfo.element.technology && (
                    <Typography variant="caption" sx={{ display: 'block', color: colors.accent, fontSize: '0.7rem', mt: 0.5, wordBreak: 'break-word' }}>
                      {selectedElementInfo.element.technology}
                    </Typography>
                  )}
                  {selectedElementInfo.element.description && (
                    <Typography variant="body2" sx={{ color: colors.textSecondary, fontSize: '0.72rem', lineHeight: 1.45, mt: 1, wordBreak: 'break-word' }}>
                      {selectedElementInfo.element.description}
                    </Typography>
                  )}
                  <Box sx={{ borderTop: `1px solid ${colors.border}`, mt: 1.25, pt: 1 }}>
                    <Typography variant="caption" sx={{ display: 'block', color: colors.textSecondary, fontSize: '0.68rem', fontWeight: 700, mb: 0.5 }}>
                      DSM
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      <Box>
                        <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.62rem' }}>
                          In
                        </Typography>
                        <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.8rem', fontWeight: 700 }}>
                          {selectedElementInfo.incoming ?? '-'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.62rem' }}>
                          Out
                        </Typography>
                        <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.8rem', fontWeight: 700 }}>
                          {selectedElementInfo.outgoing ?? '-'}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                  <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.62rem', mt: 1, wordBreak: 'break-all' }}>
                    {selectedElementInfo.element.id}
                  </Typography>
                  <Box sx={{ borderTop: `1px solid ${colors.border}`, mt: 1.25, pt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                      <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.68rem', fontWeight: 700 }}>
                        {t('c4.popup.metrics')}
                      </Typography>
                      <Tooltip title={t('viewer.tab.matrix')}>
                        <IconButton
                          size="small"
                          onClick={() => openMatrixForElement(selectedElementInfo.element)}
                          aria-label={t('viewer.tab.matrix')}
                          sx={{ ...toolbarButtonSx, p: 0.25 }}
                        >
                          <TableChartIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', color: colors.textSecondary, fontSize: '0.62rem', fontWeight: 600, mb: 0.5 }}>
                        {t('c4.popup.size')}
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.5 }}>
                        {([
                          {
                            key: 'loc',
                            // LOC は SUM(MAX) 形式。MAX は size-loc オーバーレイの色判定にも使用される。
                            display: selectedElementInfo.sizeMetrics.loc != null
                              ? `${selectedElementInfo.sizeMetrics.loc}(${selectedElementInfo.sizeMetrics.locMax ?? '-'})`
                              : '-',
                          },
                          {
                            key: 'files',
                            display: selectedElementInfo.sizeMetrics.fileCount ?? '-',
                          },
                          {
                            key: 'functionCount',
                            display: selectedElementInfo.sizeMetrics.functionCount ?? '-',
                          },
                        ] as const).map(({ key, display }) => (
                          <Box key={key}>
                            <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.58rem' }}>
                              {t(`c4.popup.metric.${key}`)}
                            </Typography>
                            <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.72rem', fontWeight: 700 }}>
                              {display}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ display: 'block', color: colors.textSecondary, fontSize: '0.62rem', fontWeight: 600, mb: 0.5 }}>
                        {t('c4.popup.quality')}
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.5 }}>
                        {(['coverage', 'branches', 'functions'] as const).map((key, i) => {
                          const pct = selectedElementInfo.coverage
                            ? (i === 0 ? selectedElementInfo.coverage.lines.pct : i === 1 ? selectedElementInfo.coverage.branches.pct : selectedElementInfo.coverage.functions.pct)
                            : null;
                          return (
                            <Box key={key}>
                              <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.58rem' }}>
                                {t(`c4.popup.metric.${key}`)}
                              </Typography>
                              <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.72rem', fontWeight: 700 }}>
                                {pct != null ? formatPct(pct) : '-'}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Box>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, mt: 0.75 }}>
                        <Box>
                          <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.58rem' }}>
                            {t('c4.popup.metric.defectRisk')}
                          </Typography>
                          <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.72rem', fontWeight: 700 }}>
                            {selectedElementInfo.defectRisk != null ? Math.round(selectedElementInfo.defectRisk) : '-'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.58rem' }}>
                            {t('c4.popup.metric.churn')}
                          </Typography>
                          <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.72rem', fontWeight: 700 }}>
                            {selectedElementInfo.hotspot?.churn ?? '-'}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ display: 'block', color: colors.textSecondary, fontSize: '0.62rem', fontWeight: 600, mb: 0.5 }}>
                        {t('c4.popup.structure')}
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
                        <Box>
                          <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.58rem' }}>
                            {t('c4.popup.metric.complexity')}
                          </Typography>
                          <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.72rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedElementInfo.complexity?.highest ?? '-'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.58rem' }}>
                            {t('c4.popup.metric.importance')}
                          </Typography>
                          <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.72rem', fontWeight: 700 }}>
                            {selectedElementInfo.importance != null ? Math.round(selectedElementInfo.importance) : '-'}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                  {selectedElementInfo.community && (() => {
                    const community = selectedElementInfo.community;
                    const summary = community.communitySummary;
                    const fallbackName = codeGraph?.communities[community.dominantCommunity];
                    const displayName = summary?.name ?? fallbackName ?? `#${community.dominantCommunity}`;
                    const dominantColor = communityColor(community.dominantCommunity);
                    const showBreakdown = community.breakdown.length > 1;
                    const topThree = community.breakdown.slice(0, 3);
                    const otherCount = community.breakdown.slice(3).reduce((sum, e) => sum + e.count, 0);
                    const totalCount = community.breakdown.reduce((sum, e) => sum + e.count, 0);
                    const elementId = selectedElementInfo.element.id;
                    const getRoleForCommunity = (communityId: number) => {
                      if (!featureMatrix) return null;
                      const featureId = `f_community_${communityId}`;
                      return featureMatrix.mappings.find(
                        m => m.featureId === featureId && m.elementId === elementId,
                      )?.role ?? null;
                    };
                    const roleBgColors = getCommunityRoleBgColors();
                    const roleBgColor = (role: string) =>
                      roleBgColors[role as keyof typeof roleBgColors] ?? roleBgColors.dependency;
                    const roleLabel = (role: string) =>
                      COMMUNITY_ROLE_LABELS[role as keyof typeof COMMUNITY_ROLE_LABELS] ?? role;
                    const dominantRole = getRoleForCommunity(community.dominantCommunity);
                    return (
                      <Box sx={{ borderTop: `1px solid ${colors.border}`, mt: 1.25, pt: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.68rem', fontWeight: 700 }}>
                            {t('c4.community.title')}
                          </Typography>
                          <Tooltip title={t('viewer.tab.graph')}>
                            <IconButton
                              size="small"
                              onClick={() => setShowGraphPopup(prev => !prev)}
                              aria-label={t('viewer.tab.graph')}
                              sx={{ ...toolbarButtonSx, p: 0.25 }}
                            >
                              <HubIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: dominantColor, flexShrink: 0 }} />
                          <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.74rem', fontWeight: 600, wordBreak: 'break-word' }}>
                            {displayName}
                          </Typography>
                          {dominantRole && (
                            <Typography variant="caption" sx={{ display: 'inline-block', px: 0.5, py: 0.125, borderRadius: '4px', bgcolor: roleBgColor(dominantRole), color: '#fff', fontSize: '0.6rem', fontWeight: 700 }}>
                              {roleLabel(dominantRole)}
                            </Typography>
                          )}
                        </Box>
                        {summary?.summary && (
                          <Typography variant="caption" sx={{ display: 'block', color: colors.textSecondary, fontSize: '0.66rem', mt: 0.5, lineHeight: 1.4 }}>
                            {summary.summary}
                          </Typography>
                        )}
                        {community.isGodNode && (
                          <Typography variant="caption" sx={{ display: 'inline-block', mt: 0.5, px: 0.5, py: 0.125, borderRadius: '4px', bgcolor: colors.accent, color: isDark ? colors.bg : '#fff', fontSize: '0.6rem', fontWeight: 700 }}>
                            ★ {t('c4.community.hubNode')}
                          </Typography>
                        )}
                        {showBreakdown && (
                          <Box sx={{ mt: 0.75 }}>
                            <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.6rem', mb: 0.25 }}>
                              {t('c4.community.breakdown')}
                            </Typography>
                            {topThree.map(entry => {
                              const entrySummary = codeGraph?.communitySummaries?.[entry.community];
                              const entryFallback = codeGraph?.communities[entry.community];
                              const entryName = entrySummary?.name ?? entryFallback ?? `#${entry.community}`;
                              const entryRole = getRoleForCommunity(entry.community);
                              const tooltipLabel = (
                                <Box>
                                  <Box sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                                    {entryName} <Box component="span" sx={{ opacity: 0.7, fontWeight: 400 }}>#{entry.community}</Box>
                                  </Box>
                                  {entrySummary?.summary && (
                                    <Box sx={{ fontSize: '0.66rem', mt: 0.25, opacity: 0.85, maxWidth: 240 }}>
                                      {entrySummary.summary}
                                    </Box>
                                  )}
                                  <Box sx={{ fontSize: '0.66rem', mt: 0.25, opacity: 0.85 }}>
                                    {entry.count} / {totalCount} ({Math.round((entry.count / totalCount) * 100)}%)
                                  </Box>
                                </Box>
                              );
                              return (
                                <Tooltip key={entry.community} title={tooltipLabel} arrow placement="left">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, cursor: 'help' }}>
                                    <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: communityColor(entry.community), flexShrink: 0 }} />
                                    <Box sx={{ flex: 1, height: 4, bgcolor: colors.hover, borderRadius: '2px', overflow: 'hidden' }}>
                                      <Box sx={{ width: `${(entry.count / totalCount) * 100}%`, height: '100%', bgcolor: communityColor(entry.community) }} />
                                    </Box>
                                    {entryRole && (
                                      <Typography variant="caption" sx={{ px: 0.4, py: 0.1, borderRadius: '3px', bgcolor: roleBgColor(entryRole), color: '#fff', fontSize: '0.58rem', fontWeight: 700, lineHeight: 1.2 }}>
                                        {roleLabel(entryRole)}
                                      </Typography>
                                    )}
                                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.6rem', minWidth: 32, textAlign: 'right' }}>
                                      {Math.round((entry.count / totalCount) * 100)}%
                                    </Typography>
                                  </Box>
                                </Tooltip>
                              );
                            })}
                            {otherCount > 0 && (() => {
                              const otherEntries = community.breakdown.slice(3);
                              const otherTooltip = (
                                <Box sx={{ maxWidth: 260 }}>
                                  <Box sx={{ fontWeight: 700, fontSize: '0.72rem', mb: 0.25 }}>
                                    {t('c4.community.other')} ({otherEntries.length})
                                  </Box>
                                  {otherEntries.map(e => {
                                    const s = codeGraph?.communitySummaries?.[e.community];
                                    const f = codeGraph?.communities[e.community];
                                    const n = s?.name ?? f ?? `#${e.community}`;
                                    return (
                                      <Box key={e.community} sx={{ fontSize: '0.66rem', opacity: 0.85 }}>
                                        ● {n} #{e.community} — {e.count} ({Math.round((e.count / totalCount) * 100)}%)
                                      </Box>
                                    );
                                  })}
                                </Box>
                              );
                              return (
                                <Tooltip title={otherTooltip} arrow placement="left">
                                  <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.58rem', cursor: 'help' }}>
                                    {t('c4.community.other')}: {Math.round((otherCount / totalCount) * 100)}%
                                  </Typography>
                                </Tooltip>
                              );
                            })()}
                          </Box>
                        )}
                      </Box>
                    );
                  })()}
                  {selectedElementInfo.element.type === 'code' && (
                    <Box sx={{ borderTop: `1px solid ${colors.border}`, mt: 1.25, pt: 1 }}>
                      <Typography variant="caption" sx={{ display: 'block', color: colors.textSecondary, fontSize: '0.68rem', fontWeight: 700, mb: 0.5 }}>
                        {t('c4.popup.functions')}
                      </Typography>
                      {elementFunctionsLoading ? (
                        <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.65rem' }}>
                          ...
                        </Typography>
                      ) : !elementFunctions || elementFunctions.symbols.length === 0 ? (
                        <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.65rem' }}>
                          {t('c4.popup.functions.empty')}
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                          {elementFunctions.symbols.map(sym => (
                            <Box key={sym.id} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                              <Typography
                                component="span"
                                sx={{
                                  fontSize: '0.58rem',
                                  fontWeight: 700,
                                  color: colors.codeLink,
                                  flexShrink: 0,
                                  textTransform: 'uppercase',
                                }}
                              >
                                {sym.kind.slice(0, 2)}
                              </Typography>
                              <Typography
                                component="span"
                                sx={{
                                  fontSize: '0.68rem',
                                  color: colors.text,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  flex: 1,
                                }}
                              >
                                {sym.name}
                              </Typography>
                              <Typography
                                component="span"
                                sx={{ fontSize: '0.58rem', color: colors.textMuted, flexShrink: 0 }}
                              >
                                :{sym.line + 1}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  )}
                  <Box sx={{ borderTop: `1px solid ${colors.border}`, mt: 1.25, pt: 1 }}>
                    <Typography variant="caption" sx={{ display: 'block', color: colors.textSecondary, fontSize: '0.68rem', fontWeight: 700, mb: 0.5 }}>
                      Documents
                    </Typography>
                    {selectedElementInfo.documents.length === 0 ? (
                      <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.68rem' }}>
                        No linked documents
                      </Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {selectedElementInfo.documents.map(doc => (
                          <Button
                            key={doc.path}
                            size="small"
                            onClick={() => onDocLinkClick?.(doc)}
                            sx={{
                              justifyContent: 'flex-start',
                              minHeight: 26,
                              px: 0.5,
                              py: 0.25,
                              color: colors.text,
                              textTransform: 'none',
                              '&:hover': { bgcolor: colors.hover },
                            }}
                          >
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: 16,
                                px: 0.5,
                                mr: 0.75,
                                borderRadius: '4px',
                                bgcolor: DOC_TYPE_COLORS[doc.type] ?? DOC_TYPE_FALLBACK_COLOR,
                                color: '#000',
                                fontSize: '0.58rem',
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {doc.type}
                            </Box>
                            <Typography component="span" sx={{ fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.title}
                            </Typography>
                          </Button>
                        ))}
                      </Box>
                    )}
                  </Box>
                  <DeadCodeDetailSection
                    entries={selectedElementInfo
                      ? fileAnalysisEntriesForElement(fileAnalysisEntries, selectedElementInfo.element.id, c4Model?.elements ?? [])
                      : []}
                    t={t as (key: string) => string}
                    colors={colors}
                    onFileOpen={(filePath) => onOpenFile?.(filePath)}
                  />
                </Box>
              )}
              {selectedCommunityInfo && !selectedElementInfo && (
                <Box
                  role="dialog"
                  aria-label="Selected community details"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: SELECTED_ELEMENT_DETAILS_WIDTH,
                    maxHeight: 'calc(100% - 20px)',
                    overflow: 'auto',
                    zIndex: 10,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    bgcolor: colors.popupBg,
                    color: colors.text,
                    boxShadow: POPUP_SHADOW,
                    backdropFilter: 'blur(10px)',
                    px: 1.5,
                    py: 1.25,
                  }}
                >
                  <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    {t('c4.community.title')}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: selectedCommunityInfo.color, flexShrink: 0 }} />
                    <Typography variant="subtitle2" sx={{ color: colors.text, fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.3, wordBreak: 'break-word' }}>
                      {selectedCommunityInfo.displayName}
                    </Typography>
                  </Box>
                  {selectedCommunityInfo.summaryText && (
                    <Typography variant="body2" sx={{ color: colors.textSecondary, fontSize: '0.72rem', lineHeight: 1.45, mt: 1, wordBreak: 'break-word' }}>
                      {selectedCommunityInfo.summaryText}
                    </Typography>
                  )}
                  <Box sx={{ borderTop: `1px solid ${colors.border}`, mt: 1.25, pt: 0.75 }}>
                    <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.62rem' }}>
                      {t('c4.community.nodeCount')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: colors.text, fontSize: '0.8rem', fontWeight: 700 }}>
                      {selectedCommunityInfo.nodeCount}
                    </Typography>
                  </Box>
                  {selectedCommunityInfo.children.length > 0 && (
                    <Box sx={{ borderTop: `1px solid ${colors.border}`, mt: 1.25, pt: 0.75 }}>
                      <Typography variant="caption" sx={{ display: 'block', color: colors.textSecondary, fontSize: '0.68rem', fontWeight: 700, mb: 0.5 }}>
                        {t('c4.community.containers')}
                      </Typography>
                      {selectedCommunityInfo.children.slice(0, 8).map(child => (
                        <Typography key={child.id} variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.65rem', py: 0.125, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          • {child.name}
                        </Typography>
                      ))}
                      {selectedCommunityInfo.children.length > 8 && (
                        <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.62rem', mt: 0.25 }}>
                          + {selectedCommunityInfo.children.length - 8}
                        </Typography>
                      )}
                    </Box>
                  )}
                  <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.62rem', mt: 1 }}>
                    #{selectedCommunityInfo.cid}
                  </Typography>
                </Box>
              )}
              {showContextMenu && contextMenu && (
                <>
                  {/* オーバーレイ: メニュー外クリックで閉じる */}
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
                    onMouseDown={handleCloseContextMenu}
                  />
                  {/* コンテキストメニュー本体 */}
                  <div
                    style={{
                      position: 'fixed',
                      top: contextMenu.y,
                      left: contextMenu.x,
                      zIndex: 1001,
                      background: colors.contextMenuBg,
                      border: `1px solid ${colors.contextMenuBorder}`,
                      borderRadius: 4,
                      boxShadow: CONTEXT_MENU_SHADOW,
                      minWidth: 140,
                      padding: '4px 0',
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {canDrillDown && (
                      <button
                        type="button"
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '6px 16px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: colors.contextMenuText,
                        }}
                        onClick={() => handleDrillDown(contextMenu.c4Id)}
                      >
                        {t('c4.drillDown')}
                      </button>
                    )}
                    {canDrillUp && (
                      <button
                        type="button"
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '6px 16px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: colors.contextMenuText,
                        }}
                        onClick={handleDrillUp}
                      >
                        {t('c4.drillUp')}
                      </button>
                    )}
                    {canShowOnlyFrame && (
                      <button
                        type="button"
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '6px 16px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: colors.contextMenuText,
                        }}
                        onClick={() =>
                          soloFrameId === contextMenu.c4Id
                            ? handleClearFrameFilter()
                            : handleShowOnlyFrame(contextMenu.c4Id)
                        }
                      >
                        {soloFrameId === contextMenu.c4Id
                          ? t('c4.clearFrameFilter')
                          : t('c4.showOnlyThisFrame')}
                      </button>
                    )}
                    {canOpenFile && (
                      <button
                        type="button"
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '6px 16px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: colors.contextMenuText,
                        }}
                        onClick={handleOpenFile}
                      >
                        {t('c4.openFile')}
                      </button>
                    )}
                    {canShowSequence && (
                      <button
                        type="button"
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '6px 16px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: colors.contextMenuText,
                        }}
                        onClick={() => {
                          onShowSequence?.(contextMenu.c4Id);
                          setContextMenu(null);
                        }}
                      >
                        {t('c4.showSequence')}
                      </button>
                    )}
                    {canCopyPath && (
                      <button
                        type="button"
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '6px 16px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: colors.contextMenuText,
                        }}
                        onClick={handleCopyPath}
                      >
                        {t('c4.copyPath')}
                      </button>
                    )}
                    {canShowManualActions && (
                      <>
                        <button
                          type="button"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '6px 16px',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: colors.contextMenuText,
                          }}
                          onClick={() => {
                            setSelectedElementId(contextMenu.c4Id);
                            setAddRelOpen(true);
                            setContextMenu(null);
                          }}
                        >
                          <LinkIcon sx={{ fontSize: 16 }} />
                          Rel
                        </button>
                        <button
                          type="button"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '6px 16px',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: colors.cycleBorder,
                          }}
                          onClick={() => handleDeleteElement(contextMenu.c4Id)}
                        >
                          <DeleteIcon sx={{ fontSize: 16 }} />
                          Del
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </Box>
            {showActivityTrend && (
            <Box
              role="dialog"
              aria-label="Activity Trend"
              sx={{
                ...getActivityTrendChartPlacement(),
                width: getActivityTrendChartWidth(!!selectedElementInfo),
                minWidth: 0,
                maxWidth: `${TREND_CHART_POPUP_MAX_WIDTH}px`,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                bgcolor: colors.popupBg,
                boxShadow: POPUP_SHADOW,
                backdropFilter: 'blur(10px)',
                overflow: 'hidden',
                transition: 'width 150ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <ActivityTrendChart
                elementId={selectedElementId}
                serverUrl={serverUrl}
                repoName={selectedRepo || undefined}
                isDark={isDark}
              />
            </Box>
            )}
          </Box>
      </Box>
      <C4DialogsArea
        c4Model={c4Model}
        addElementType={addElementType}
        editElement={editElement}
        addRelOpen={addRelOpen}
        selectedSystemId={selectedSystemId}
        selectedElementId={selectedElementId}
        onCloseAddElement={() => setAddElementType(null)}
        onCloseEditElement={() => setEditElement(null)}
        onCloseAddRelationship={() => setAddRelOpen(false)}
        onSubmitAddElement={handleAddElement}
        onSubmitUpdateElement={handleUpdateElement}
        onSubmitAddRelationship={handleAddRelationship}
      />
    </Box>
  );
}
