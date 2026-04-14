import { aggregateDsmToC4ComponentLevel, aggregateDsmToC4ContainerLevel, aggregateDsmToC4SystemLevel, buildElementTree, buildLevelView, c4ToGraphDocument, collectDescendantIds, computeColorMap, filterDsmMatrix, filterModelForDrill, filterTreeByLevel, sortDsmMatrixByName } from '@anytime-markdown/trail-core/c4';
import type { BoundaryInfo, C4Element, C4Model, C4ReleaseEntry, ComplexityMatrix, CoverageDiffMatrix, CoverageMatrix, DocLink, DsmMatrix, FeatureMatrix, ImportanceMatrix, MetricOverlay } from '@anytime-markdown/trail-core/c4';
import type { GraphDocument, GraphNode } from '@anytime-markdown/graph-core';
import { engine, layoutWithSubgroups, state as graphState } from '@anytime-markdown/graph-core';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import LinkIcon from '@mui/icons-material/Link';
import PersonIcon from '@mui/icons-material/Person';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import LinearProgress from '@mui/material/LinearProgress';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { useTrailI18n } from '../../i18n';
import { getC4Colors } from '../c4Theme';

const UNKNOWN_REPO_KEY = '__unknown__';
const CURRENT_RELEASE_TAG = 'current';

/** チェックボックス非表示フィルタ対象の型（system は常時表示のため除外） */
const FILTER_CHECKABLE_TYPES = new Set(['container', 'containerDb', 'component'] as const);
/** ドリルダウン時のスコープに含まれる型 */
const DRILL_SCOPE_TYPES = new Set(['system', 'container', 'containerDb', 'component'] as const);
import { AddElementDialog, AddRelationshipDialog } from './C4EditDialogs';
import type { ElementFormData, RelationshipFormData } from './C4EditDialogs';
import type { ExportedSymbol, FlowGraph } from '@anytime-markdown/trail-core/analyzer';
import { C4ElementTree } from './C4ElementTree';
import { CoverageCanvas } from './CoverageCanvas';
import { DsmCanvas } from './DsmCanvas';
import { FcMapCanvas } from './FcMapCanvas';
import { FlowchartCanvas } from './FlowchartCanvas';
import { GraphCanvas } from './GraphCanvas';
import { OverlayLegend } from './OverlayLegend';
import { computeClaudeActivityColorMap } from '../claudeActivityColorMap';

const { graphReducer, createInitialState } = graphState;
const { fitToContent } = engine;

/** Bounding box of a set of graph nodes */
function computeBounds(nodes: readonly GraphNode[]) {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }
  return { minX, minY, maxX, maxY };
}

export interface C4ViewerCoreProps {
  readonly isDark?: boolean;
  readonly c4Model: C4Model | null;
  readonly boundaries: readonly BoundaryInfo[];
  readonly featureMatrix: FeatureMatrix | null;
  readonly dsmMatrix: DsmMatrix | null;
  readonly coverageMatrix: CoverageMatrix | null;
  readonly coverageDiff: CoverageDiffMatrix | null;
  readonly complexityMatrix?: ComplexityMatrix | null;
  readonly importanceMatrix?: ImportanceMatrix | null;
  readonly docLinks?: readonly DocLink[];
  readonly connected?: boolean;
  readonly analysisProgress?: { phase: string; percent: number } | null;
  readonly onAddElement?: (data: ElementFormData) => void;
  readonly onUpdateElement?: (id: string, data: ElementFormData) => void;
  readonly onAddRelationship?: (data: RelationshipFormData) => void;
  readonly onRemoveElement?: (id: string) => void;
  readonly onPurgeDeleted?: () => void;
  readonly onDocLinkClick?: (doc: DocLink) => void;
  readonly onImport?: () => void;
  readonly containerHeight?: string;
  readonly releases?: readonly C4ReleaseEntry[];
  readonly selectedRelease?: string;
  readonly onReleaseSelect?: (release: string) => void;
  readonly selectedRepo?: string;
  readonly onRepoSelect?: (repo: string) => void;
  readonly serverUrl?: string;
  readonly claudeActivity?: import('../hooks/useC4DataSource').ClaudeActivityState | null;
  readonly onResetClaudeActivity?: () => void;
}

export function C4ViewerCore({
  isDark = false,
  c4Model,
  boundaries: boundaryInfos,
  featureMatrix,
  dsmMatrix,
  coverageMatrix,
  coverageDiff,
  complexityMatrix,
  importanceMatrix,
  docLinks,
  connected,
  analysisProgress,
  onAddElement,
  onUpdateElement,
  onAddRelationship,
  onRemoveElement,
  onPurgeDeleted,
  onDocLinkClick,
  onImport,
  containerHeight = '100vh',
  releases = [],
  selectedRelease = CURRENT_RELEASE_TAG,
  onReleaseSelect,
  selectedRepo: selectedRepoProp,
  onRepoSelect,
  serverUrl = '',
  claudeActivity,
  onResetClaudeActivity,
}: Readonly<C4ViewerCoreProps>) {
  const { t } = useTrailI18n();
  const colors = useMemo(() => getC4Colors(isDark), [isDark]);

  // リリース entry と current entry 両方からリポジトリを収集する
  const repoOptions = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const r of releases) {
      const key = r.repoName ?? (r.tag === CURRENT_RELEASE_TAG ? '' : UNKNOWN_REPO_KEY);
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
    return order;
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

  const handleRepoChange = useCallback((event: SelectChangeEvent<string>): void => {
    const next = event.target.value;
    setSelectedRepoInternal(next);
    onRepoSelect?.(next);
  }, [onRepoSelect]);

  const handleReleaseChange = useCallback((event: SelectChangeEvent<string>): void => {
    onReleaseSelect?.(event.target.value);
  }, [onReleaseSelect]);

  const [state, dispatch] = useReducer(graphReducer, createInitialState());
  const [fullDoc, setFullDoc] = useState<GraphDocument | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(1);

  const [showC4, setShowC4] = useState(true);
  const [showDsm, setShowDsm] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [matrixView, setMatrixView] = useState<'dsm' | 'fcmap' | 'coverage'>('dsm');
  const [metricOverlay, setMetricOverlay] = useState<MetricOverlay>('none');
  const [dsmLevel, setDsmLevel] = useState<'component' | 'package'>('component');
  const [dsmClustered, setDsmClustered] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [drillStack, setDrillStack] = useState<readonly { readonly element: C4Element; readonly prevLevel: number; readonly prevCheckedIds: ReadonlySet<string> | null }[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    readonly x: number;
    readonly y: number;
    readonly c4Id: string;
    readonly nodeType: string;
  } | null>(null);
  const [checkedPackageIds, setCheckedPackageIds] = useState<ReadonlySet<string> | null>(null);
  const [centerOnSelect, setCenterOnSelect] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);

  // --- Flow mode state ---
  const [exports, setExports] = useState<readonly ExportedSymbol[]>([]);
  const [selectedExport, setSelectedExport] = useState<ExportedSymbol | null>(null);
  const [flowType, setFlowType] = useState<'control' | 'call'>('control');
  const [flowGraph, setFlowGraph] = useState<FlowGraph | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [showFlow, setShowFlow] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Editing state ---
  const [addElementType, setAddElementType] = useState<'person' | 'system' | null>(null);
  const [editElement, setEditElement] = useState<{ id: string; type: 'person' | 'system'; name: string; description: string; external: boolean } | null>(null);
  const [addRelOpen, setAddRelOpen] = useState(false);

  const handleElementSelect = useCallback(async (id: string) => {
    setCenterOnSelect(true);
    setSelectedElementId(id);
    setSelectedExport(null);
    setFlowGraph(null);
    setShowFlow(false);

    const el = c4Model?.elements.find(e => e.id === id);
    if (el?.type !== 'component') { setExports([]); return; }

    try {
      const repoQuery = selectedRepo ? `&repo=${encodeURIComponent(selectedRepo)}` : '';
      const url = `${serverUrl}/api/c4/exports?componentId=${encodeURIComponent(id)}${repoQuery}`;
      const res = await fetch(url);
      if (!res.ok) { setExports([]); return; }
      const data = await res.json() as { symbols: ExportedSymbol[] };
      setExports(data.symbols ?? []);
    } catch {
      setExports([]);
    }
  }, [c4Model, serverUrl, selectedRepo]);

  const handleExportSelect = useCallback(async (symbol: ExportedSymbol) => {
    setSelectedExport(symbol);
    setFlowError(null);
    setFlowGraph(null);
    setShowFlow(true);

    try {
      const repoQuery = selectedRepo ? `&repo=${encodeURIComponent(selectedRepo)}` : '';
      const url = `${serverUrl}/api/c4/flowchart?componentId=${encodeURIComponent(selectedElementId ?? '')}&symbolId=${encodeURIComponent(symbol.id)}&type=${flowType}${repoQuery}`;
      const res = await fetch(url);
      if (!res.ok) { setFlowError('Failed to load flowchart'); return; }
      const data = await res.json() as { graph: FlowGraph };
      setFlowGraph(data.graph ?? null);
    } catch {
      setFlowError('Failed to load flowchart');
    }
  }, [serverUrl, selectedElementId, flowType, selectedRepo]);

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

  const handleDeleteSelected = useCallback(() => {
    if (!selectedElementId || !c4Model) return;
    const elem = c4Model.elements.find(e => e.id === selectedElementId);
    if (elem?.manual) {
      onRemoveElement?.(selectedElementId);
      setSelectedElementId(null);
    }
  }, [selectedElementId, c4Model, onRemoveElement]);

  const selectedIsManual = useMemo(() => {
    if (!selectedElementId || !c4Model) return false;
    return c4Model.elements.find(e => e.id === selectedElementId)?.manual === true;
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

    const doc = c4ToGraphDocument(filteredModel, boundaryInfos);
    layoutWithSubgroups(doc, 'TB', 180, 60);
    setFullDoc(doc);
    if (currentLevel < 4) {
      const view = buildLevelView(doc, currentLevel);
      layoutWithSubgroups(view, 'TB', 180, 60);
      dispatch({ type: 'SET_DOCUMENT', doc: view });
    } else {
      dispatch({ type: 'SET_DOCUMENT', doc });
    }
  }, [c4Model, boundaryInfos, drillStack, currentLevel, checkedPackageIds]);

  /** 右クリックメニューを表示する */
  const handleNodeContextMenu = useCallback(
    (c4Id: string, x: number, y: number, nodeType: string) => {
      setContextMenu({ x, y, c4Id, nodeType });
    },
    [],
  );

  /** コンテキストメニューを閉じる */
  const handleCloseContextMenu = useCallback(() => {
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
      setContextMenu(null);
    },
    [c4Model, currentLevel, drillTargetLevel, checkedPackageIds],
  );

  const handleDrillUp = useCallback(() => {
    const entry = drillStack.at(-1);
    if (entry?.prevLevel !== undefined) setCurrentLevel(entry.prevLevel);
    setDrillStack((prev) => prev.slice(0, -1));
    setCheckedPackageIds(null);
    setCheckReset(prev => ({ key: prev.key + 1, ids: entry?.prevCheckedIds ?? null, expanded: null }));
    setContextMenu(null);
  }, [drillStack]);

  const handleSetLevel = useCallback((level: number) => {
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
      m = filterDsmMatrix(m, checkedPackageIds);
    }
    return m;
  }, [dsmMatrix, currentLevel, c4Model, checkedPackageIds]);

  const overlayMap = useMemo(
    () => computeColorMap(metricOverlay, coverageMatrix, filteredDsmMatrix, complexityMatrix ?? null, importanceMatrix ?? null),
    [metricOverlay, coverageMatrix, filteredDsmMatrix, complexityMatrix, importanceMatrix],
  );

  const claudeActivityMap = useMemo(() => {
    if (!claudeActivity) return null;
    const { activeElementIds, touchedElementIds } = claudeActivity;
    if (activeElementIds.length === 0 && touchedElementIds.length === 0) return null;
    return computeClaudeActivityColorMap(activeElementIds, touchedElementIds, isDark);
  }, [claudeActivity, isDark]);

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

  const handleSplitDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const treeWidth = elementTree.length > 0 ? 260 : 0;
      const available = rect.width - treeWidth;
      if (available <= 0) return;
      const ratio = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / available));
      setSplitRatio(ratio);
    };
    const onUp = () => {
      globalThis.removeEventListener('mousemove', onMove);
      globalThis.removeEventListener('mouseup', onUp);
      globalThis.document.body.style.cursor = '';
      globalThis.document.body.style.userSelect = '';
    };
    globalThis.addEventListener('mousemove', onMove);
    globalThis.addEventListener('mouseup', onUp);
    globalThis.document.body.style.cursor = 'col-resize';
    globalThis.document.body.style.userSelect = 'none';
  }, [elementTree.length]);

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

  // コンテキストメニュー表示時の情報計算
  // boundaryId で親子関係が表現されているため、children ではなく boundaryId で子の有無を判定する
  // 現在のドリルルートへの再ドリルは防ぐ
  const canDrillDown = contextMenu !== null &&
    contextMenu.nodeType !== 'frame' &&
    drillStack.at(-1)?.element.id !== contextMenu.c4Id &&
    (c4Model?.elements.some(e => e.boundaryId === contextMenu.c4Id) ?? false);
  const canDrillUp = contextMenu !== null &&
    contextMenu.nodeType === 'frame' &&
    drillStack.length > 0;
  const showContextMenu = contextMenu !== null && (canDrillDown || canDrillUp);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: containerHeight, bgcolor: colors.bg }}>
      <Toolbar variant="dense" sx={{ gap: 1, bgcolor: isDark ? 'rgba(18,18,18,0.85)' : 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${colors.border}`, minHeight: 44, px: { xs: 2, md: 3 }, zIndex: 1100 }}>
        {onImport && (
          <Button
            size="small"
            startIcon={<UploadFileIcon sx={{ fontSize: 18 }} />}
            onClick={onImport}
            sx={toolbarButtonSx}
          >
            Import
          </Button>
        )}
        {repoOptions.length > 0 && (
          <Select
            size="small"
            value={selectedRepo}
            onChange={handleRepoChange}
            sx={{ fontSize: '0.75rem', height: 28, minWidth: 100, mr: 0.5, '& .MuiSelect-select': { py: '2px' } }}
            aria-label={t('c4.releaseRepository')}
          >
            {repoOptions.map((key) => (
              <MenuItem key={key} value={key} sx={{ fontSize: '0.75rem' }}>
                {key === UNKNOWN_REPO_KEY ? t('c4.unknownRepo') : key}
              </MenuItem>
            ))}
          </Select>
        )}
        {visibleReleases.length > 0 && (
          <Select
            size="small"
            value={selectedRelease}
            onChange={handleReleaseChange}
            sx={{ fontSize: '0.75rem', height: 28, minWidth: 120, mr: 0.5, '& .MuiSelect-select': { py: '2px' } }}
            aria-label={t('c4.releases')}
          >
            {visibleReleases.map((entry) => (
              <MenuItem key={entry.tag} value={entry.tag} sx={{ fontSize: '0.75rem' }}>
                {entry.tag === CURRENT_RELEASE_TAG ? t('c4.currentRelease') : entry.tag}
              </MenuItem>
            ))}
          </Select>
        )}
        <ButtonGroup size="small" sx={{ ml: 1 }}>
          {([1, 2, 3, 4] as const).map(level => (
            <Button
              key={level}
              onClick={() => handleSetLevel(level)}
              aria-pressed={currentLevel === level}
              aria-label={`Level ${level}: ${({ 1: 'Context', 2: 'Container', 3: 'Component', 4: 'Code' } as const)[level]}`}
              title={({ 1: 'Context', 2: 'Container', 3: 'Component', 4: 'Code' } as const)[level]}
              sx={currentLevel === level ? levelButtonActiveSx : levelButtonSx}
            >
              L{level}
            </Button>
          ))}
        </ButtonGroup>
        <Button size="small" startIcon={<FitScreenIcon sx={{ fontSize: 16 }} />} onClick={handleFit} sx={{ ...toolbarButtonSx, ml: 0.5 }} aria-label="Fit">Fit</Button>
        <Box sx={{ flex: 1 }} />
        {/* 指標オーバーレイ ドロップダウン */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
          <Typography variant="caption" sx={{ fontSize: '0.7rem', color: colors.textMuted, whiteSpace: 'nowrap' }}>
            {t('c4.overlay.label')}:
          </Typography>
          <Select
            size="small"
            value={metricOverlay}
            onChange={(e) => { setMetricOverlay(e.target.value as MetricOverlay); }}
            sx={{ fontSize: '0.75rem', height: 24, '.MuiSelect-select': { py: 0, px: 1 } }}
            aria-label={t('c4.overlay.label')}
          >
            <MenuItem value="none" sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.none')}</MenuItem>
            <ListSubheader sx={{ fontSize: '0.65rem', lineHeight: '24px', bgcolor: 'transparent' }}>
              {t('c4.overlay.groupCoverage')}
            </ListSubheader>
            <MenuItem value="coverage-lines" disabled={!coverageMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.coverageLines')}</MenuItem>
            <MenuItem value="coverage-branches" disabled={!coverageMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.coverageBranches')}</MenuItem>
            <MenuItem value="coverage-functions" disabled={!coverageMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.coverageFunctions')}</MenuItem>
            <ListSubheader sx={{ fontSize: '0.65rem', lineHeight: '24px', bgcolor: 'transparent' }}>
              {t('c4.overlay.groupDsm')}
            </ListSubheader>
            <MenuItem value="dsm-out" disabled={!filteredDsmMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.dsmOut')}</MenuItem>
            <MenuItem value="dsm-in" disabled={!filteredDsmMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.dsmIn')}</MenuItem>
            <MenuItem value="dsm-cyclic" disabled={!filteredDsmMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.dsmCyclic')}</MenuItem>
            <ListSubheader sx={{ fontSize: '0.65rem', lineHeight: '24px', bgcolor: 'transparent' }}>
              {t('c4.overlay.groupComplexity')}
            </ListSubheader>
            <MenuItem value="complexity-most" disabled={!complexityMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.complexityMost')}</MenuItem>
            <MenuItem value="complexity-highest" disabled={!complexityMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.complexityHighest')}</MenuItem>
            <ListSubheader sx={{ fontSize: '0.7rem', lineHeight: '2' }}>
              {t('c4.overlay.groupImportance')}
            </ListSubheader>
            <MenuItem value="importance" disabled={!importanceMatrix} sx={{ fontSize: '0.75rem' }}>{t('c4.overlay.importance')}</MenuItem>
          </Select>
        </Box>
        <Button size="small" onClick={() => { if (showC4 && !showDsm) { setShowDsm(true); } else { setShowC4(true); setShowDsm(false); } }} aria-pressed={showC4 && !showDsm} aria-label="Toggle C4 graph" sx={{ ...toolbarButtonSx, ...(showC4 && !showDsm && { bgcolor: toolbarButtonActiveBg }) }}>C4</Button>
        <Button size="small" onClick={() => { if (!showC4 && showDsm) { setShowC4(true); } else { setShowC4(false); setShowDsm(true); } }} aria-pressed={!showC4 && showDsm} aria-label="Toggle matrix panel" sx={{ ...toolbarButtonSx, ...(!showC4 && showDsm && { bgcolor: toolbarButtonActiveBg }) }}>Matrix</Button>
        {selectedExport && (
          <>
            <Button
              size="small"
              onClick={() => setShowFlow(prev => !prev)}
              aria-pressed={showFlow}
              sx={{ ...toolbarButtonSx, ...(showFlow && { bgcolor: toolbarButtonActiveBg }) }}
            >
              Flow: {selectedExport.name}
            </Button>
            {showFlow && (
              <ButtonGroup size="small">
                {(['control', 'call'] as const).map(t => (
                  <Button
                    key={t}
                    onClick={() => { setFlowType(t); }}
                    sx={{ ...toolbarButtonSx, fontSize: '0.7rem', ...(flowType === t && { bgcolor: toolbarButtonActiveBg }) }}
                  >
                    {t}
                  </Button>
                ))}
              </ButtonGroup>
            )}
          </>
        )}
        {claudeActivity && (claudeActivity.activeElementIds.length > 0 || claudeActivity.touchedElementIds.length > 0) && (
          <Button
            size="small"
            variant="outlined"
            onClick={onResetClaudeActivity}
            title={t('c4.claudeActivity.reset')}
            sx={{ ...toolbarButtonSx, ml: 0.5 }}
          >
            {t('c4.claudeActivity.reset')}
          </Button>
        )}
      </Toolbar>
      {currentLevel === 1 && (
        <Toolbar variant="dense" sx={{ gap: 1, bgcolor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}`, minHeight: 36, px: { xs: 2, md: 3 } }}>
          <Typography variant="caption" sx={{ color: colors.textMuted, mr: 1, fontSize: '0.7rem' }}>Edit</Typography>
          <Button size="small" startIcon={<PersonIcon sx={{ fontSize: 16 }} />} onClick={() => setAddElementType('person')} sx={toolbarButtonSx} aria-label="Add Person">Person</Button>
          <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={() => setAddElementType('system')} sx={toolbarButtonSx} aria-label="Add System">System</Button>
          <Button size="small" startIcon={<LinkIcon sx={{ fontSize: 16 }} />} onClick={() => setAddRelOpen(true)} disabled={!selectedElementId} sx={toolbarButtonSx} aria-label="Add Relationship">Rel</Button>
          <Button size="small" startIcon={<DeleteIcon sx={{ fontSize: 16 }} />} onClick={handleDeleteSelected} disabled={!selectedIsManual} sx={{ ...toolbarButtonSx, ...(selectedIsManual && { color: '#ef5350' }) }} aria-label="Delete selected">Del</Button>
        </Toolbar>
      )}
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
            bgcolor: 'rgba(0,0,0,0.6)',
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
            onCheckedChange={setCheckedPackageIds}
            checkReset={checkReset}
            onRemoveElement={onRemoveElement}
            onPurgeDeleted={onPurgeDeleted}
            docLinks={docLinks}
            onDocLinkClick={onDocLinkClick}
            isDark={isDark}
            exports={exports}
            selectedExportId={selectedExport?.id ?? null}
            onExportSelect={handleExportSelect}
          />
        )}
        {/* 既存コンテンツ (C4Graph / Separator / DSM) */}
        {showC4 && (
          <Box sx={{ flex: showDsm ? splitRatio : 1, display: 'flex', flexDirection: 'column', minWidth: 100 }}>
            <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <GraphCanvas
                isDark={isDark}
                document={state.document}
                viewport={state.document.viewport}
                dispatch={dispatch}
                canvasRef={canvasRef}
                selectedNodeId={selectedElementId ? (state.document.nodes.find(n => n.metadata?.c4Id === selectedElementId)?.id ?? null) : null}
                centerOnSelect={centerOnSelect}
                overlayMap={overlayMap.size > 0 ? overlayMap : null}
                claudeActivityMap={claudeActivityMap}
                onNodeSelect={(id) => { setCenterOnSelect(false); setSelectedElementId(id); }}
                onNodeDoubleClick={(nodeId) => {
                  if (!c4Model) return;
                  const elem = c4Model.elements.find(e => e.id === nodeId);
                  if (elem?.manual && (elem.type === 'person' || elem.type === 'system')) {
                    setEditElement({ id: elem.id, type: elem.type, name: elem.name, description: elem.description ?? '', external: elem.external ?? false });
                  }
                }}
                onNodeContextMenu={handleNodeContextMenu}
              />
              <OverlayLegend overlay={metricOverlay} isDark={isDark} dsmMax={dsmMax} />
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
                      background: isDark ? '#2d2d2d' : '#ffffff',
                      border: `1px solid ${isDark ? '#555' : '#ccc'}`,
                      borderRadius: 4,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
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
                          color: isDark ? '#e0e0e0' : '#333',
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
                          color: isDark ? '#e0e0e0' : '#333',
                        }}
                        onClick={handleDrillUp}
                      >
                        {t('c4.drillUp')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </Box>
          </Box>
        )}
        {showC4 && showDsm && (
          <Box
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(splitRatio * 100)}
            aria-valuemin={20}
            aria-valuemax={80}
            aria-label="Resize C4 graph and DSM matrix"
            tabIndex={0}
            onMouseDown={handleSplitDrag}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setSplitRatio(prev => Math.max(0.2, prev - 0.05));
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                setSplitRatio(prev => Math.min(0.8, prev + 0.05));
              }
            }}
            sx={{ width: 5, cursor: 'col-resize', bgcolor: 'transparent', borderLeft: `1px solid ${colors.border}`, '&:hover': { bgcolor: colors.focus }, '&:focus-visible': { outline: `2px solid ${colors.accent}`, outlineOffset: '2px' }, flexShrink: 0 }}
          />
        )}
        {showFlow && (
          <Box sx={{ flex: showC4 ? 1 - splitRatio : 1, display: 'flex', flexDirection: 'column', minWidth: 100 }}>
            <FlowchartCanvas
              graph={flowGraph ?? { nodes: [], edges: [] }}
              isDark={isDark}
              errorMessage={flowError}
            />
          </Box>
        )}
        {showDsm && (
          <Box sx={{ flex: showC4 ? 1 - splitRatio : 1, display: 'flex', flexDirection: 'column', minWidth: 100 }}>
            <Toolbar variant="dense" sx={{ gap: 0.5, bgcolor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}`, minHeight: 36, px: 1, flexShrink: 0 }}>
              <Button size="small" onClick={() => { setMatrixView('dsm'); }} aria-pressed={matrixView === 'dsm'} aria-label="Show DSM matrix" sx={{ ...toolbarButtonSx, fontSize: '0.75rem', ...(matrixView === 'dsm' && { bgcolor: toolbarButtonActiveBg }) }}>DSM</Button>
              <Button size="small" onClick={() => { setMatrixView('fcmap'); }} aria-pressed={matrixView === 'fcmap'} aria-label="Show F-C Map" disabled={!featureMatrix} sx={{ ...toolbarButtonSx, fontSize: '0.75rem', ...(matrixView === 'fcmap' && { bgcolor: toolbarButtonActiveBg }) }}>F-C Map</Button>
              <Button size="small" onClick={() => { const next = matrixView !== 'coverage'; setShowCoverage(next); setMatrixView(next ? 'coverage' : 'dsm'); }} aria-pressed={matrixView === 'coverage'} aria-label="Show coverage" disabled={!coverageMatrix} sx={{ ...toolbarButtonSx, fontSize: '0.75rem', ...(matrixView === 'coverage' && { bgcolor: toolbarButtonActiveBg }) }}>Cov</Button>
              <Button size="small" onClick={() => setDsmClustered(prev => !prev)} sx={{ ...toolbarButtonSx, fontSize: '0.75rem', ...(dsmClustered && { bgcolor: toolbarButtonActiveBg }) }}>Cluster</Button>
            </Toolbar>
            <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {matrixView === 'coverage' && coverageMatrix && c4Model ? (
                <CoverageCanvas coverageMatrix={coverageMatrix} coverageDiff={coverageDiff} model={c4Model} level={currentLevel} isDark={isDark} />
              ) : matrixView === 'fcmap' && featureMatrix && c4Model ? (
                <FcMapCanvas featureMatrix={featureMatrix} model={c4Model} excludedElementIds={excludedDescendantIds} level={currentLevel} isDark={isDark} />
              ) : filteredDsmMatrix ? (
                <DsmCanvas
                  matrix={filteredDsmMatrix}
                  fullModel={c4Model ?? undefined}
                  clustered={dsmClustered}
                  focusedNodeId={selectedElementId}
                  scopeIds={selectedScopeIds}
                  deletedIds={deletedIds}
                  isDark={isDark}
                />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                    Import a C4 model to view DSM
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
      <AddElementDialog
        open={addElementType !== null && !editElement}
        elementType={addElementType ?? 'person'}
        onSubmit={handleAddElement}
        onClose={() => setAddElementType(null)}
      />
      <AddElementDialog
        open={editElement !== null}
        elementType={editElement?.type ?? 'person'}
        initial={editElement ?? undefined}
        onSubmit={handleUpdateElement}
        onClose={() => setEditElement(null)}
      />
      {selectedElementId && (
        <AddRelationshipDialog
          open={addRelOpen}
          from={selectedElementId}
          fromName={c4Model?.elements.find(e => e.id === selectedElementId)?.name ?? selectedElementId}
          candidates={c4Model?.elements.filter(e => e.id !== selectedElementId && (e.type === 'person' || e.type === 'system' || e.type === 'container')).map(e => ({ id: e.id, name: e.name })) ?? []}
          onSubmit={handleAddRelationship}
          onClose={() => setAddRelOpen(false)}
        />
      )}
    </Box>
  );
}

