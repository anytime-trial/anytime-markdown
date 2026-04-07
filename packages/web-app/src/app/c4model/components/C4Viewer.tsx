'use client';

import { buildElementTree, buildLevelView, c4ToGraphDocument, collectDescendantIds, extractBoundaries, filterTreeByLevel, parseMermaidC4 } from '@anytime-markdown/c4-kernel';
import type { BoundaryInfo, C4Model, CoverageDiffMatrix, CoverageMatrix, DocLink, FeatureMatrix } from '@anytime-markdown/c4-kernel';
import type { GraphDocument, GraphNode } from '@anytime-markdown/graph-core';
import { engine, layoutWithSubgroups, state as graphState } from '@anytime-markdown/graph-core';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import LinkIcon from '@mui/icons-material/Link';
import PersonIcon from '@mui/icons-material/Person';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { AddElementDialog, AddRelationshipDialog, C4ElementTree, CoverageCanvas, DsmCanvas, FcMapCanvas, GraphCanvas } from '@anytime-markdown/c4-viewer';
import type { ElementFormData, RelationshipFormData } from '@anytime-markdown/c4-viewer';

const { graphReducer, createInitialState } = graphState;
const { fitToContent } = engine;

/** ノード群のバウンディングボックスを計算 */
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

let nextManualId = 1;
function generateManualId(type: string): string {
  return `manual-${type}-${Date.now()}-${nextManualId++}`;
}

/** デザインシステム: ミッドナイトネイビー背景 */
const BG_PRIMARY = '#0D1117';
/** デザインシステム: チャコール */
const BG_SECONDARY = '#121212';
/** デザインシステム: アイスブルー */
const ACCENT_BLUE = '#90CAF9';
/** デザインシステム: ボーダー */
const BORDER_COLOR = 'rgba(255,255,255,0.12)';

export function C4Viewer() {
  const [state, dispatch] = useReducer(graphReducer, createInitialState());
  const [fullDoc, setFullDoc] = useState<GraphDocument | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(4);
  const [c4Model, setC4Model] = useState<C4Model | null>(null);
  const [boundaryInfos, setBoundaryInfos] = useState<readonly BoundaryInfo[]>([]);

  const [featureMatrix, setFeatureMatrix] = useState<FeatureMatrix | null>(null);
  const [coverageMatrix, setCoverageMatrix] = useState<CoverageMatrix | null>(null);
  const [coverageDiff, setCoverageDiff] = useState<CoverageDiffMatrix | null>(null);
  const [showTree, setShowTree] = useState(true);
  const [showC4, setShowC4] = useState(true);
  const [showDsm, setShowDsm] = useState(true);
  const [showCoverage, setShowCoverage] = useState(false);
  const [matrixView, setMatrixView] = useState<'dsm' | 'fcmap' | 'coverage'>('dsm');
  const [dsmLevel, setDsmLevel] = useState<'component' | 'package'>('component');
  const [dsmClustered, setDsmClustered] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [checkedPackageIds, setCheckedPackageIds] = useState<ReadonlySet<string> | null>(null);
  const [centerOnSelect, setCenterOnSelect] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Editing state ---
  const [docLinks, setDocLinks] = useState<readonly DocLink[]>([]);

  const [addElementType, setAddElementType] = useState<'person' | 'system' | null>(null);
  const [editElement, setEditElement] = useState<{ id: string; type: 'person' | 'system'; name: string; description: string; external: boolean } | null>(null);
  const [addRelOpen, setAddRelOpen] = useState(false);

  const handleAddElement = useCallback((data: ElementFormData) => {
    if (!c4Model) return;
    const newElement = {
      id: generateManualId(data.type),
      type: data.type as 'person' | 'system',
      name: data.name,
      description: data.description || undefined,
      external: data.external,
      manual: true,
    };
    setC4Model({
      ...c4Model,
      elements: [...c4Model.elements, newElement],
    });
  }, [c4Model]);

  const handleUpdateElement = useCallback((data: ElementFormData) => {
    if (!editElement || !c4Model) return;
    setC4Model({
      ...c4Model,
      elements: c4Model.elements.map(e =>
        e.id === editElement.id
          ? { ...e, name: data.name, description: data.description || undefined, external: data.external }
          : e,
      ),
    });
    setEditElement(null);
  }, [editElement, c4Model]);

  const handleAddRelationship = useCallback((data: RelationshipFormData) => {
    if (!c4Model) return;
    setC4Model({
      ...c4Model,
      relationships: [...c4Model.relationships, {
        from: data.from,
        to: data.to,
        label: data.label || undefined,
        technology: data.technology || undefined,
        manual: true,
      }],
    });
  }, [c4Model]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedElementId || !c4Model) return;
    const elem = c4Model.elements.find(e => e.id === selectedElementId);
    if (elem?.manual) {
      setC4Model({
        ...c4Model,
        elements: c4Model.elements.filter(e => e.id !== selectedElementId),
        relationships: c4Model.relationships.filter(r => r.from !== selectedElementId && r.to !== selectedElementId),
      });
      setSelectedElementId(null);
    }
  }, [selectedElementId, c4Model]);

  const selectedIsManual = useMemo(() => {
    if (!selectedElementId || !c4Model) return false;
    return c4Model.elements.find(e => e.id === selectedElementId)?.manual === true;
  }, [selectedElementId, c4Model]);

  const handleRemoveElement = useCallback((id: string) => {
    if (!c4Model) return;
    const elem = c4Model.elements.find(e => e.id === id);
    if (elem?.manual) {
      setC4Model({
        ...c4Model,
        elements: c4Model.elements.filter(e => e.id !== id),
        relationships: c4Model.relationships.filter(r => r.from !== id && r.to !== id),
      });
    } else {
      // 非手動要素は削除フラグを付ける
      setC4Model({
        ...c4Model,
        elements: c4Model.elements.map(e => e.id === id ? { ...e, deleted: true } : e),
      });
    }
  }, [c4Model]);

  const handlePurgeDeleted = useCallback(() => {
    if (!c4Model) return;
    const deletedIdSet = new Set(c4Model.elements.filter(e => e.deleted).map(e => e.id));
    setC4Model({
      ...c4Model,
      elements: c4Model.elements.filter(e => !e.deleted),
      relationships: c4Model.relationships.filter(r => !deletedIdSet.has(r.from) && !deletedIdSet.has(r.to)),
    });
  }, [c4Model]);

  const loadMermaidText = useCallback((text: string) => {
    try {
      const boundaries = extractBoundaries(text);
      const model = parseMermaidC4(text);
      setC4Model(model);
      setBoundaryInfos(boundaries);
      const doc = c4ToGraphDocument(model, boundaries);
      layoutWithSubgroups(doc, 'TB', 180, 60);
      setFullDoc(doc);
      setCurrentLevel(4);
      dispatch({ type: 'SET_DOCUMENT', doc });
    } catch {
      // invalid C4 mermaid
    }
  }, []);

  /** Graph JSON (.graph) — { model, boundaries, featureMatrix } 形式をロード */
  const loadGraphJson = useCallback((json: string) => {
    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      // c4-model.json 形式: { model, boundaries, featureMatrix? }
      if (data.model && typeof data.model === 'object') {
        const model = data.model as C4Model;
        if (!model.elements || !Array.isArray(model.elements)) return;
        const boundaries = (Array.isArray(data.boundaries) ? data.boundaries : []) as BoundaryInfo[];
        setC4Model(model);
        setBoundaryInfos(boundaries);
        if (data.featureMatrix && typeof data.featureMatrix === 'object') {
          setFeatureMatrix(data.featureMatrix as FeatureMatrix);
        }
        if (data.coverageMatrix && typeof data.coverageMatrix === 'object') {
          setCoverageMatrix(data.coverageMatrix as CoverageMatrix);
        }
        if (data.coverageDiff && typeof data.coverageDiff === 'object') {
          setCoverageDiff(data.coverageDiff as CoverageDiffMatrix);
        }
        const doc = c4ToGraphDocument(model, boundaries);
        layoutWithSubgroups(doc, 'TB', 180, 60);
        setFullDoc(doc);
        setCurrentLevel(4);
        dispatch({ type: 'SET_DOCUMENT', doc });
        return;
      }
      // 純粋な GraphDocument 形式
      const doc = data as unknown as GraphDocument;
      if (doc.nodes && doc.edges) {
        setFullDoc(doc);
        dispatch({ type: 'SET_DOCUMENT', doc });
      }
    } catch {
      // invalid JSON
    }
  }, [dispatch]);

  // 初期表示: public/c4-model.json を読み込む
  useEffect(() => {
    fetch('/c4-model.json')
      .then(res => { if (res.ok) return res.text(); })
      .then(json => { if (json) loadGraphJson(json); })
      .catch(() => { /* ファイルが存在しない場合は無視 */ });
  }, [loadGraphJson]);

  // ドキュメントインデックスの取得
  useEffect(() => {
    fetch('/api/docs-index')
      .then(res => { if (res.ok) return res.json(); })
      .then((data: { docs?: DocLink[] } | undefined) => {
        if (data?.docs) setDocLinks(data.docs);
      })
      .catch(() => { /* docs-index unavailable */ });
  }, []);

  const handleDocLinkClick = useCallback((doc: DocLink) => {
    const repo = process.env.NEXT_PUBLIC_DOCS_GITHUB_REPO;
    if (repo) {
      globalThis.open(`https://github.com/${repo}/blob/main/${doc.path}`, '_blank');
    }
  }, []);

  // c4Model のローカル編集をグラフに反映（レベル維持）
  const currentLevelRef = useRef(currentLevel);
  currentLevelRef.current = currentLevel;
  const isInitialLoadRef = useRef(true);
  useEffect(() => {
    if (!c4Model) return;
    // 初回ロード時は loadMermaidText/loadGraphJson が直接 dispatch するのでスキップ
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    const doc = c4ToGraphDocument(c4Model, boundaryInfos);
    layoutWithSubgroups(doc, 'TB', 180, 60);
    setFullDoc(doc);
    const level = currentLevelRef.current;
    if (level < 4) {
      const view = buildLevelView(doc, level);
      layoutWithSubgroups(view, 'TB', 180, 60);
      dispatch({ type: 'SET_DOCUMENT', doc: view });
    } else {
      dispatch({ type: 'SET_DOCUMENT', doc });
    }
  }, [c4Model, boundaryInfos]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mmd,.mermaid,.txt,.graph,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'graph' || ext === 'json') {
          isInitialLoadRef.current = true;
          loadGraphJson(text);
        } else {
          isInitialLoadRef.current = true;
          loadMermaidText(text);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [loadMermaidText, loadGraphJson]);

  const handleSetLevel = useCallback((level: number) => {
    if (!fullDoc) return;
    setCurrentLevel(level);
    const view = buildLevelView(fullDoc, level);
    layoutWithSubgroups(view, 'TB', 180, 60);
    dispatch({ type: 'SET_DOCUMENT', doc: view });
    // L2=Package, L3+=Component
    if (level <= 2) {
      setDsmLevel('package');
    } else {
      setDsmLevel('component');
    }
  }, [fullDoc]);

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

  // 削除フラグ付き要素のIDセット（DSM表示用）
  const deletedIds = useMemo(() => {
    if (!c4Model) return undefined;
    const ids = new Set<string>();
    for (const el of c4Model.elements) {
      if (el.deleted) ids.add(el.id);
    }
    return ids.size > 0 ? ids : undefined;
  }, [c4Model]);

  // カバレッジヒートマップ用マップ (c4Id → lines.pct)
  const coverageMap = useMemo(() => {
    if (!showCoverage || !coverageMatrix) return null;
    const map = new Map<string, number>();
    for (const entry of coverageMatrix.entries) {
      map.set(entry.elementId, entry.lines.pct);
    }
    return map;
  }, [showCoverage, coverageMatrix]);

  // カバレッジ差分ヒートマップ用マップ (c4Id → lines.pctDelta)
  const coverageDiffMap = useMemo(() => {
    if (!showCoverage || !coverageDiff) return null;
    const map = new Map<string, number>();
    for (const entry of coverageDiff.entries) {
      map.set(entry.elementId, entry.lines.pctDelta);
    }
    return map;
  }, [showCoverage, coverageDiff]);

  // チェックOFFパッケージ配下の要素IDを収集
  const excludedDescendantIds = useMemo(() => {
    if (!c4Model || !checkedPackageIds) return null;
    const excluded = new Set<string>();
    for (const elem of c4Model.elements) {
      const isCheckable = elem.type === 'container' || elem.type === 'containerDb' || elem.type === 'component';
      if (isCheckable && !checkedPackageIds.has(elem.id)) {
        const descendants = collectDescendantIds(c4Model.elements, elem.id);
        for (const id of descendants) excluded.add(id);
        excluded.add(elem.id);
      }
    }
    return excluded.size > 0 ? excluded : null;
  }, [c4Model, checkedPackageIds]);

  // DSM用: C4レベルに応じた要素タイプでフィルタし、パッケージ選択時は配下のみ表示
  const dsmModel = useMemo(() => {
    if (!c4Model) return null;

    // L2=package はbuildC4Matrixがboundary単位で処理するのでフィルタ不要
    if (dsmLevel === 'package') {
      if (!excludedDescendantIds) return c4Model;
      const filteredElements = c4Model.elements.filter(e => !excludedDescendantIds.has(e.id));
      const filteredIds = new Set(filteredElements.map(e => e.id));
      const filteredRelationships = c4Model.relationships.filter(
        r => filteredIds.has(r.from) || filteredIds.has(r.to),
      );
      return { ...c4Model, elements: filteredElements, relationships: filteredRelationships };
    }

    // L3=component のみ、L4=code のみ
    const targetType = currentLevel >= 4 ? 'code' : 'component';

    const filteredElements = c4Model.elements.filter(e => {
      if (e.type !== targetType) return false;
      if (excludedDescendantIds?.has(e.id)) return false;
      return true;
    });

    // チェックボックスフィルタが無効な場合のみフォールバック
    if (filteredElements.length === 0 && !excludedDescendantIds) return c4Model;

    const filteredIds = new Set(filteredElements.map(e => e.id));
    const filteredRelationships = c4Model.relationships.filter(
      r => filteredIds.has(r.from) || filteredIds.has(r.to),
    );

    return {
      ...c4Model,
      elements: filteredElements,
      relationships: filteredRelationships,
    };
  }, [c4Model, boundaryInfos, dsmLevel, currentLevel, excludedDescendantIds]);

  // 選択要素の配下IDセット（DSM太枠表示用）
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
      const treeWidth = showTree && elementTree.length > 0 ? 260 : 0;
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
  }, [showTree, elementTree.length]);

  const toolbarButtonSx = {
    textTransform: 'none', color: ACCENT_BLUE, borderColor: BORDER_COLOR,
    fontWeight: 600, fontSize: '0.875rem', borderRadius: '8px',
    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
  } as const;

  const levelButtonSx = {
    textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', minWidth: 36,
    borderColor: BORDER_COLOR, color: 'rgba(255,255,255,0.70)',
    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
  } as const;

  const levelButtonActiveSx = {
    ...levelButtonSx,
    bgcolor: `${ACCENT_BLUE} !important`,
    color: `${BG_PRIMARY} !important`,
    borderColor: `${ACCENT_BLUE} !important`,
  } as const;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', bgcolor: BG_PRIMARY }}>
      <Toolbar variant="dense" sx={{ gap: 1, bgcolor: BG_SECONDARY, borderBottom: `1px solid ${BORDER_COLOR}`, minHeight: 44, px: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1 }} aria-live="polite" aria-atomic="true">
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.3)' }} aria-hidden="true" />
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}>
            Disconnected
          </Typography>
        </Box>
        <Button
          size="small"
          startIcon={<UploadFileIcon sx={{ fontSize: 18 }} />}
          onClick={handleImport}
          sx={toolbarButtonSx}
        >
          Import
        </Button>
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
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => setShowDsm(prev => !prev)} aria-pressed={!showDsm} aria-label="Toggle matrix panel" sx={{ ...toolbarButtonSx, ...(!showDsm && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>C4</Button>
        <Button size="small" onClick={() => setShowC4(prev => !prev)} aria-pressed={!showC4} aria-label="Toggle C4 graph" sx={{ ...toolbarButtonSx, ...(!showC4 && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>Matrix</Button>
        <Button size="small" startIcon={<AccountTreeIcon sx={{ fontSize: 18 }} />} onClick={() => setShowTree(prev => !prev)} aria-pressed={showTree} aria-label="Toggle element tree" sx={{ ...toolbarButtonSx, ...(showTree && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>Tree</Button>
      </Toolbar>
      {currentLevel === 1 && (
        <Toolbar variant="dense" sx={{ gap: 1, bgcolor: BG_SECONDARY, borderBottom: `1px solid ${BORDER_COLOR}`, minHeight: 36, px: { xs: 2, md: 3 } }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', mr: 1, fontSize: '0.7rem' }}>Edit</Typography>
          <Button size="small" startIcon={<PersonIcon sx={{ fontSize: 16 }} />} onClick={() => setAddElementType('person')} sx={toolbarButtonSx} aria-label="Add Person">Person</Button>
          <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={() => setAddElementType('system')} sx={toolbarButtonSx} aria-label="Add System">System</Button>
          <Button size="small" startIcon={<LinkIcon sx={{ fontSize: 16 }} />} onClick={() => setAddRelOpen(true)} disabled={!selectedElementId} sx={toolbarButtonSx} aria-label="Add Relationship">Rel</Button>
          <Button size="small" startIcon={<DeleteIcon sx={{ fontSize: 16 }} />} onClick={handleDeleteSelected} disabled={!selectedIsManual} sx={{ ...toolbarButtonSx, ...(selectedIsManual && { color: '#ef5350' }) }} aria-label="Delete selected">Del</Button>
        </Toolbar>
      )}
      <Box ref={containerRef} sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: C4 Model */}
        {showC4 && (
          <Box sx={{ flex: showDsm ? splitRatio : 1, display: 'flex', flexDirection: 'column', minWidth: 100 }}>
            <Toolbar variant="dense" sx={{ gap: 0.5, bgcolor: BG_SECONDARY, borderBottom: `1px solid ${BORDER_COLOR}`, minHeight: 36, px: 1, flexShrink: 0 }}>
              <Button size="small" startIcon={<FitScreenIcon sx={{ fontSize: 16 }} />} onClick={handleFit} sx={{ ...toolbarButtonSx, fontSize: '0.75rem' }}>Fit</Button>
            </Toolbar>
            <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <GraphCanvas
              document={state.document}
              viewport={state.document.viewport}
              dispatch={dispatch}
              canvasRef={canvasRef}
              selectedNodeId={selectedElementId ? (state.document.nodes.find(n => n.metadata?.c4Id === selectedElementId)?.id ?? null) : null}
              centerOnSelect={centerOnSelect}
              coverageMap={coverageMap}
              coverageDiffMap={coverageDiffMap}
              onNodeSelect={(id) => { setCenterOnSelect(false); setSelectedElementId(id); }}
              onNodeDoubleClick={(nodeId) => {
                if (!c4Model) return;
                const elem = c4Model.elements.find(e => e.id === nodeId);
                if (elem?.manual && (elem.type === 'person' || elem.type === 'system')) {
                  setEditElement({ id: elem.id, type: elem.type, name: elem.name, description: elem.description ?? '', external: elem.external ?? false });
                }
              }}
            />
            </Box>
          </Box>
        )}
        {/* Resize grip */}
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
            sx={{ width: 5, cursor: 'col-resize', bgcolor: 'transparent', borderLeft: `1px solid ${BORDER_COLOR}`, '&:hover': { bgcolor: 'rgba(144,202,249,0.2)' }, '&:focus-visible': { outline: '2px solid #4FC3F7' }, flexShrink: 0 }}
          />
        )}
        {/* Center: Matrix panel (DSM / F-C Map / Coverage) */}
        {showDsm && (
          <Box sx={{ flex: showC4 ? 1 - splitRatio : 1, display: 'flex', flexDirection: 'column', minWidth: 100, borderRight: showTree && elementTree.length > 0 ? `1px solid ${BORDER_COLOR}` : 'none' }}>
            <Toolbar variant="dense" sx={{ gap: 0.5, bgcolor: BG_SECONDARY, borderBottom: `1px solid ${BORDER_COLOR}`, minHeight: 36, px: 1, flexShrink: 0 }}>
              <Button size="small" onClick={() => { setMatrixView('dsm'); }} aria-pressed={matrixView === 'dsm'} aria-label="Show DSM matrix" sx={{ ...toolbarButtonSx, fontSize: '0.75rem', ...(matrixView === 'dsm' && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>DSM</Button>
              <Button size="small" onClick={() => { setMatrixView('fcmap'); }} aria-pressed={matrixView === 'fcmap'} aria-label="Show F-C Map" disabled={!featureMatrix} sx={{ ...toolbarButtonSx, fontSize: '0.75rem', ...(matrixView === 'fcmap' && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>F-C Map</Button>
              <Button size="small" onClick={() => { const next = matrixView !== 'coverage'; setShowCoverage(next); setMatrixView(next ? 'coverage' : 'dsm'); }} aria-pressed={matrixView === 'coverage'} aria-label="Show coverage" disabled={!coverageMatrix} sx={{ ...toolbarButtonSx, fontSize: '0.75rem', ...(matrixView === 'coverage' && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>Cov</Button>
              <Button size="small" onClick={() => setDsmClustered(prev => !prev)} sx={{ ...toolbarButtonSx, fontSize: '0.75rem', ...(dsmClustered && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>Cluster</Button>
            </Toolbar>
            <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {matrixView === 'coverage' && coverageMatrix && c4Model ? (
              <CoverageCanvas coverageMatrix={coverageMatrix} coverageDiff={coverageDiff} model={c4Model} level={currentLevel} />
            ) : matrixView === 'fcmap' && featureMatrix && c4Model ? (
              <FcMapCanvas featureMatrix={featureMatrix} model={c4Model} excludedElementIds={excludedDescendantIds} level={currentLevel} />
            ) : dsmModel ? (
              <DsmCanvas
                model={dsmModel}
                fullModel={c4Model ?? undefined}
                boundaries={boundaryInfos}
                level={dsmLevel}
                clustered={dsmClustered}
                focusedNodeId={selectedElementId}
                scopeIds={selectedScopeIds}
                deletedIds={deletedIds}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                  Import a C4 model to view DSM
                </Typography>
              </Box>
            )}
            </Box>
          </Box>
        )}
        {/* Right: Element Tree */}
        {showTree && elementTree.length > 0 && (
          <C4ElementTree
            tree={elementTree}
            dispatch={dispatch}
            onSelect={(id) => { setCenterOnSelect(true); setSelectedElementId(id); }}
            onCheckedChange={setCheckedPackageIds}
            onRemoveElement={handleRemoveElement}
            onPurgeDeleted={handlePurgeDeleted}
            docLinks={docLinks}
            onDocLinkClick={handleDocLinkClick}
          />
        )}
      </Box>
      {/* --- Edit Dialogs --- */}
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
