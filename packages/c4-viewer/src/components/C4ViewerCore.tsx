import { buildElementTree, buildLevelView, c4ToGraphDocument, collectDescendantIds, filterTreeByLevel } from '@anytime-markdown/c4-kernel';
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
import LinearProgress from '@mui/material/LinearProgress';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { getC4Colors } from '../c4Theme';
import { AddElementDialog, AddRelationshipDialog } from './C4EditDialogs';
import type { ElementFormData, RelationshipFormData } from './C4EditDialogs';
import { C4ElementTree } from './C4ElementTree';
import { CoverageCanvas } from './CoverageCanvas';
import { DsmCanvas } from './DsmCanvas';
import { FcMapCanvas } from './FcMapCanvas';
import { GraphCanvas } from './GraphCanvas';

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
  readonly coverageMatrix: CoverageMatrix | null;
  readonly coverageDiff: CoverageDiffMatrix | null;
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
}

export function C4ViewerCore({
  isDark = false,
  c4Model,
  boundaries: boundaryInfos,
  featureMatrix,
  coverageMatrix,
  coverageDiff,
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
}: Readonly<C4ViewerCoreProps>) {
  const colors = useMemo(() => getC4Colors(isDark), [isDark]);

  const [state, dispatch] = useReducer(graphReducer, createInitialState());
  const [fullDoc, setFullDoc] = useState<GraphDocument | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(4);
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
  const [addElementType, setAddElementType] = useState<'person' | 'system' | null>(null);
  const [editElement, setEditElement] = useState<{ id: string; type: 'person' | 'system'; name: string; description: string; external: boolean } | null>(null);
  const [addRelOpen, setAddRelOpen] = useState(false);

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

  const handleRemoveElement = useCallback((id: string) => {
    onRemoveElement?.(id);
  }, [onRemoveElement]);

  const handlePurgeDeleted = useCallback(() => {
    onPurgeDeleted?.();
  }, [onPurgeDeleted]);

  // c4Model changes -> rebuild graph document (maintain current level)
  const currentLevelRef = useRef(currentLevel);
  currentLevelRef.current = currentLevel;
  const isInitialLoadRef = useRef(true);
  useEffect(() => {
    if (!c4Model) return;
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
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

  const deletedIds = useMemo(() => {
    if (!c4Model) return undefined;
    const ids = new Set<string>();
    for (const el of c4Model.elements) {
      if (el.deleted) ids.add(el.id);
    }
    return ids.size > 0 ? ids : undefined;
  }, [c4Model]);

  const coverageMap = useMemo(() => {
    if (!showCoverage || !coverageMatrix) return null;
    const map = new Map<string, number>();
    for (const entry of coverageMatrix.entries) {
      map.set(entry.elementId, entry.lines.pct);
    }
    return map;
  }, [showCoverage, coverageMatrix]);

  const coverageDiffMap = useMemo(() => {
    if (!showCoverage || !coverageDiff) return null;
    const map = new Map<string, number>();
    for (const entry of coverageDiff.entries) {
      map.set(entry.elementId, entry.lines.pctDelta);
    }
    return map;
  }, [showCoverage, coverageDiff]);

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
  }, [c4Model, dsmLevel, currentLevel, excludedDescendantIds]);

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

  const handleDocLinkClickInternal = useCallback((doc: DocLink) => {
    onDocLinkClick?.(doc);
  }, [onDocLinkClick]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: containerHeight, bgcolor: colors.bg }}>
      <Toolbar variant="dense" sx={{ gap: 1, bgcolor: isDark ? 'rgba(18,18,18,0.85)' : 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${colors.border}`, minHeight: 44, px: { xs: 2, md: 3 }, zIndex: 1100 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1 }} aria-live="polite" aria-atomic="true">
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: connected ? '#66BB6A' : colors.textMuted }} aria-hidden="true" />
          <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>
            {connected ? 'Connected' : 'Disconnected'}
          </Typography>
        </Box>
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
        <Button size="small" onClick={() => { if (showC4 && !showDsm) { setShowDsm(true); } else { setShowC4(true); setShowDsm(false); } }} aria-pressed={showC4 && !showDsm} aria-label="Toggle C4 graph" sx={{ ...toolbarButtonSx, ...(showC4 && !showDsm && { bgcolor: toolbarButtonActiveBg }) }}>C4</Button>
        <Button size="small" onClick={() => { if (!showC4 && showDsm) { setShowC4(true); } else { setShowC4(false); setShowDsm(true); } }} aria-pressed={!showC4 && showDsm} aria-label="Toggle matrix panel" sx={{ ...toolbarButtonSx, ...(!showC4 && showDsm && { bgcolor: toolbarButtonActiveBg }) }}>Matrix</Button>
        <Button size="small" startIcon={<AccountTreeIcon sx={{ fontSize: 18 }} />} onClick={() => setShowTree(prev => !prev)} aria-pressed={showTree} aria-label="Toggle element tree" sx={{ ...toolbarButtonSx, ...(showTree && { bgcolor: toolbarButtonActiveBg }) }}>Tree</Button>
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
        {showC4 && (
          <Box sx={{ flex: showDsm ? splitRatio : 1, display: 'flex', flexDirection: 'column', minWidth: 100 }}>
            <Toolbar variant="dense" sx={{ gap: 0.5, bgcolor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}`, minHeight: 36, px: 1, flexShrink: 0 }}>
              <Button size="small" startIcon={<FitScreenIcon sx={{ fontSize: 16 }} />} onClick={handleFit} sx={{ ...toolbarButtonSx, fontSize: '0.75rem' }}>Fit</Button>
            </Toolbar>
            <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <GraphCanvas
                isDark={isDark}
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
        {showDsm && (
          <Box sx={{ flex: showC4 ? 1 - splitRatio : 1, display: 'flex', flexDirection: 'column', minWidth: 100, borderRight: showTree && elementTree.length > 0 ? `1px solid ${colors.border}` : 'none' }}>
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
        {showTree && elementTree.length > 0 && (
          <C4ElementTree
            tree={elementTree}
            dispatch={dispatch}
            onSelect={(id) => { setCenterOnSelect(true); setSelectedElementId(id); }}
            onCheckedChange={setCheckedPackageIds}
            onRemoveElement={handleRemoveElement}
            onPurgeDeleted={handlePurgeDeleted}
            docLinks={docLinks}
            onDocLinkClick={handleDocLinkClickInternal}
            isDark={isDark}
          />
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
