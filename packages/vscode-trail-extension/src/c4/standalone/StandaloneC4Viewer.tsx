import { buildElementTree, buildLevelView, c4ToGraphDocument, collectDescendantIds, filterTreeByLevel } from '@anytime-markdown/c4-kernel';
import type { DocLink } from '@anytime-markdown/c4-kernel';
import type { GraphNode } from '@anytime-markdown/graph-core';
import { engine, layoutWithSubgroups, state as graphState } from '@anytime-markdown/graph-core';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import LinkIcon from '@mui/icons-material/Link';
import PersonIcon from '@mui/icons-material/Person';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import LinearProgress from '@mui/material/LinearProgress';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { AddElementDialog, AddRelationshipDialog, C4ElementTree, CoverageCanvas, DsmCanvas, FcMapCanvas, GraphCanvas, useC4DataSource } from '@anytime-markdown/c4-viewer';
import type { ElementFormData, RelationshipFormData } from '@anytime-markdown/c4-viewer';

const { graphReducer, createInitialState } = graphState;
const { fitToContent } = engine;

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

const BG_PRIMARY = '#0D1117';
const BG_SECONDARY = '#121212';
const ACCENT_BLUE = '#90CAF9';
const BORDER_COLOR = 'rgba(255,255,255,0.12)';

export function StandaloneC4Viewer() {
  const serverUrl = globalThis.location.origin;
  const dataSource = useC4DataSource(serverUrl);

  const [state, dispatch] = useReducer(graphReducer, createInitialState());
  const [fullDoc, setFullDoc] = useState<import('@anytime-markdown/graph-core').GraphDocument | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(4);
  const [showTree, setShowTree] = useState(true);
  const [showC4, setShowC4] = useState(true);
  const [showDsm, setShowDsm] = useState(true);
  const [matrixView, setMatrixView] = useState<'dsm' | 'fcmap' | 'coverage'>('dsm');
  const [showCoverage, setShowCoverage] = useState(false);
  const [dsmLevel, setDsmLevel] = useState<'component' | 'package'>('component');
  const [dsmClustered, setDsmClustered] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [checkedPackageIds, setCheckedPackageIds] = useState<ReadonlySet<string> | null>(null);
  const [centerOnSelect, setCenterOnSelect] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const c4Model = dataSource.c4Model;
  const boundaryInfos = dataSource.boundaries;
  const analysisProgress = dataSource.analysisProgress;

  // --- Editing state ---
  const [addElementType, setAddElementType] = useState<'person' | 'system' | null>(null);
  const [editElement, setEditElement] = useState<{ id: string; type: 'person' | 'system'; name: string; description: string; external: boolean } | null>(null);
  const [addRelOpen, setAddRelOpen] = useState(false);

  const handleAddElement = useCallback((data: ElementFormData) => {
    dataSource.sendCommand('add-element', { element: data });
  }, [dataSource]);

  const handleUpdateElement = useCallback((data: ElementFormData) => {
    if (!editElement) return;
    dataSource.sendCommand('update-element', { id: editElement.id, changes: { name: data.name, description: data.description || undefined, external: data.external } });
    setEditElement(null);
  }, [dataSource, editElement]);

  const handleAddRelationship = useCallback((data: RelationshipFormData) => {
    dataSource.sendCommand('add-relationship', { from: data.from, to: data.to, label: data.label || undefined, technology: data.technology || undefined });
  }, [dataSource]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedElementId || !c4Model) return;
    const elem = c4Model.elements.find(e => e.id === selectedElementId);
    if (elem?.manual) {
      dataSource.sendCommand('remove-element', { id: selectedElementId });
      setSelectedElementId(null);
    }
  }, [selectedElementId, c4Model, dataSource]);

  const selectedIsManual = useMemo(() => {
    if (!selectedElementId || !c4Model) return false;
    return c4Model.elements.find(e => e.id === selectedElementId)?.manual === true;
  }, [selectedElementId, c4Model]);

  // 2ノード選択判定用（将来的に複数選択に対応する場合はここを拡張）
  // 現状は1ノードのみ選択可能なので、Relationship追加はツリーから2つ選択する方式ではなく
  // 「from を選択 → + Rel → to を選択」のフローにする
  // 簡易版: selectedElementId が存在すれば from として扱い、ダイアログで to をドロップダウンから選ぶ

  // dataSource のモデル更新をグラフに反映
  const currentLevelRef = useRef(currentLevel);
  currentLevelRef.current = currentLevel;
  useEffect(() => {
    if (!c4Model) return;
    const doc = c4ToGraphDocument(c4Model, boundaryInfos);
    layoutWithSubgroups(doc, 'TB', 180, 60);
    setFullDoc(doc);
    // モデル更新時は現在のレベルを維持し、レベルビューを再適用
    const level = currentLevelRef.current;
    if (level < 4) {
      const view = buildLevelView(doc, level);
      layoutWithSubgroups(view, 'TB', 180, 60);
      dispatch({ type: 'SET_DOCUMENT', doc: view });
    } else {
      dispatch({ type: 'SET_DOCUMENT', doc });
    }
  }, [c4Model, boundaryInfos]);

  const handleSetLevel = useCallback((level: number) => {
    if (!fullDoc) return;
    setCurrentLevel(level);
    const view = buildLevelView(fullDoc, level);
    layoutWithSubgroups(view, 'TB', 180, 60);
    dispatch({ type: 'SET_DOCUMENT', doc: view });
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

  const handleDocLinkClick = useCallback((doc: DocLink) => {
    dataSource.sendCommand('open-doc-link', { path: doc.path });
  }, [dataSource]);

  const handleRemoveElement = useCallback((id: string) => {
    dataSource.sendCommand('remove-element', { id });
  }, [dataSource]);

  const handlePurgeDeleted = useCallback(() => {
    dataSource.sendCommand('purge-deleted-elements');
  }, [dataSource]);

  // カバレッジヒートマップ用マップ (c4Id → lines.pct)
  const coverageMap = useMemo(() => {
    if (!showCoverage || !dataSource.coverageMatrix) return null;
    const map = new Map<string, number>();
    for (const entry of dataSource.coverageMatrix.entries) {
      map.set(entry.elementId, entry.lines.pct);
    }
    return map;
  }, [showCoverage, dataSource.coverageMatrix]);

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

  const dsmModel = useMemo(() => {
    if (!c4Model) return null;
    if (dsmLevel === 'package') {
      if (!excludedDescendantIds) return c4Model;
      const filteredElements = c4Model.elements.filter(e => !excludedDescendantIds.has(e.id));
      const filteredIds = new Set(filteredElements.map(e => e.id));
      const filteredRelationships = c4Model.relationships.filter(
        r => filteredIds.has(r.from) || filteredIds.has(r.to),
      );
      return { ...c4Model, elements: filteredElements, relationships: filteredRelationships };
    }
    const targetType = currentLevel >= 4 ? 'code' : 'component';

    const filteredElements = c4Model.elements.filter(e => {
      if (e.type !== targetType) return false;
      if (excludedDescendantIds?.has(e.id)) return false;
      return true;
    });

    if (filteredElements.length === 0 && !excludedDescendantIds) return c4Model;

    const filteredIds = new Set(filteredElements.map(e => e.id));
    const filteredRelationships = c4Model.relationships.filter(
      r => filteredIds.has(r.from) || filteredIds.has(r.to),
    );

    return { ...c4Model, elements: filteredElements, relationships: filteredRelationships };
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: BG_PRIMARY }}>
      <Toolbar variant="dense" sx={{ gap: 1, bgcolor: BG_SECONDARY, borderBottom: `1px solid ${BORDER_COLOR}`, minHeight: 44, px: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1 }} aria-live="polite" aria-atomic="true">
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dataSource.connected ? '#4caf50' : 'rgba(255,255,255,0.3)' }} aria-hidden="true" />
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}>
            {dataSource.connected ? 'Connected' : 'Disconnected'}
          </Typography>
        </Box>
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
        <Button size="small" startIcon={<FitScreenIcon sx={{ fontSize: 18 }} />} onClick={handleFit} sx={toolbarButtonSx}>Fit</Button>
        <Button size="small" onClick={() => setDsmClustered(prev => !prev)} sx={{ ...toolbarButtonSx, ...(dsmClustered && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>Cluster</Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => { if (showC4 && !showDsm) return; setShowC4(prev => !prev); }} aria-pressed={showC4} aria-label="Toggle C4 graph" sx={{ ...toolbarButtonSx, ...(showC4 && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>C4</Button>
        <Button size="small" onClick={() => { if (showDsm && !showC4) return; setShowDsm(prev => !prev); if (!showDsm) setMatrixView('dsm'); }} aria-pressed={showDsm && matrixView === 'dsm'} aria-label="Toggle DSM matrix" sx={{ ...toolbarButtonSx, ...(showDsm && matrixView === 'dsm' && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>DSM</Button>
        <Button size="small" onClick={() => { setShowDsm(true); setMatrixView('fcmap'); }} aria-pressed={showDsm && matrixView === 'fcmap'} aria-label="Toggle F-C Map" disabled={!dataSource.featureMatrix} sx={{ ...toolbarButtonSx, ...(showDsm && matrixView === 'fcmap' && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>F-C Map</Button>
        <Button size="small" onClick={() => { const next = !showCoverage; setShowCoverage(next); if (next) { setShowDsm(true); setMatrixView('coverage'); } }} aria-pressed={showCoverage} aria-label="Toggle coverage overlay" disabled={!dataSource.coverageMatrix} sx={{ ...toolbarButtonSx, ...(showCoverage && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>Cov</Button>
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
            bgcolor: BG_SECONDARY,
            border: `1px solid ${BORDER_COLOR}`,
            borderRadius: 2,
            px: 4,
            py: 3,
            minWidth: 360,
            maxWidth: 480,
            textAlign: 'center',
          }}>
            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 600, mb: 1 }}>
              Analyzing Workspace
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 2 }}>
              {analysisProgress.phase}
            </Typography>
            <LinearProgress
              variant={analysisProgress.percent >= 0 ? 'determinate' : 'indeterminate'}
              value={analysisProgress.percent >= 0 ? analysisProgress.percent : undefined}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: 'rgba(255,255,255,0.08)',
                '& .MuiLinearProgress-bar': { bgcolor: ACCENT_BLUE, borderRadius: 3 },
              }}
            />
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', mt: 1, display: 'block' }}>
              {analysisProgress.percent >= 0 ? `${analysisProgress.percent}%` : ''}
            </Typography>
          </Box>
        </Box>
      )}
      <Box ref={containerRef} sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {showC4 && (
          <Box sx={{ flex: showDsm ? splitRatio : 1, position: 'relative', minWidth: 100 }}>
            <GraphCanvas document={state.document} viewport={state.document.viewport} dispatch={dispatch} canvasRef={canvasRef}
              selectedNodeId={selectedElementId ? (state.document.nodes.find(n => n.metadata?.c4Id === selectedElementId)?.id ?? null) : null}
              centerOnSelect={centerOnSelect}
              coverageMap={coverageMap}
              onNodeSelect={(id) => { setCenterOnSelect(false); setSelectedElementId(id); }}
              onNodeDoubleClick={(nodeId) => {
                if (!c4Model) return;
                const elem = c4Model.elements.find(e => e.id === nodeId);
                if (elem?.manual && (elem.type === 'person' || elem.type === 'system')) {
                  setEditElement({ id: elem.id, type: elem.type, name: elem.name, description: elem.description ?? '', external: elem.external ?? false });
                }
              }} />
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
            sx={{ width: 5, cursor: 'col-resize', bgcolor: 'transparent', borderLeft: `1px solid ${BORDER_COLOR}`, '&:hover': { bgcolor: 'rgba(144,202,249,0.2)' }, '&:focus-visible': { outline: '2px solid #4FC3F7' }, flexShrink: 0 }}
          />
        )}
        {showDsm && (
          <Box sx={{ flex: showC4 ? 1 - splitRatio : 1, position: 'relative', minWidth: 100, borderRight: showTree && elementTree.length > 0 ? `1px solid ${BORDER_COLOR}` : 'none' }}>
            {matrixView === 'coverage' && dataSource.coverageMatrix && c4Model ? (
              <CoverageCanvas coverageMatrix={dataSource.coverageMatrix} model={c4Model} level={currentLevel} />
            ) : matrixView === 'fcmap' && dataSource.featureMatrix && c4Model ? (
              <FcMapCanvas featureMatrix={dataSource.featureMatrix} model={c4Model} excludedElementIds={excludedDescendantIds} level={currentLevel} />
            ) : dsmModel ? (
              <DsmCanvas model={dsmModel} fullModel={c4Model ?? undefined} boundaries={boundaryInfos} level={dsmLevel} clustered={dsmClustered} focusedNodeId={selectedElementId} scopeIds={selectedScopeIds} deletedIds={deletedIds} />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>Waiting for C4 model...</Typography>
              </Box>
            )}
          </Box>
        )}
        {showTree && elementTree.length > 0 && (
          <C4ElementTree tree={elementTree} dispatch={dispatch} onSelect={(id) => { setCenterOnSelect(true); setSelectedElementId(id); }} onCheckedChange={setCheckedPackageIds} onRemoveElement={handleRemoveElement} onPurgeDeleted={handlePurgeDeleted} docLinks={dataSource.docLinks} onDocLinkClick={handleDocLinkClick} />
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
