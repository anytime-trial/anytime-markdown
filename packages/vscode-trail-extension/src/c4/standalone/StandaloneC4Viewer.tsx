import { buildElementTree, buildLevelView, c4ToGraphDocument, collectDescendantIds, filterTreeByLevel } from '@anytime-markdown/c4-kernel';
import type { GraphNode } from '@anytime-markdown/graph-core';
import { engine, layoutWithSubgroups, state as graphState } from '@anytime-markdown/graph-core';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { C4ElementTree, DsmCanvas, GraphCanvas, useC4DataSource } from '@anytime-markdown/graph-core/c4';

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
  const [dsmLevel, setDsmLevel] = useState<'component' | 'package'>('component');
  const [dsmClustered, setDsmClustered] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const c4Model = dataSource.c4Model;
  const boundaryInfos = dataSource.boundaries;

  // dataSource のモデル更新をグラフに反映
  useEffect(() => {
    if (!c4Model) return;
    const doc = c4ToGraphDocument(c4Model, boundaryInfos);
    layoutWithSubgroups(doc, 'TB', 180, 60);
    setFullDoc(doc);
    setCurrentLevel(4);
    dispatch({ type: 'SET_DOCUMENT', doc });
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

  const dsmModel = useMemo(() => {
    if (!c4Model) return null;
    if (dsmLevel === 'package') return c4Model;
    const targetType = currentLevel >= 4 ? 'code' : 'component';

    let scopeIds: Set<string> | null = null;
    if (selectedElementId) {
      const selectedElement = c4Model.elements.find(e => e.id === selectedElementId);
      const isBoundary = boundaryInfos.some(b => b.id === selectedElementId);
      const isContainer = selectedElement && (selectedElement.type === 'container' || selectedElement.type === 'containerDb');
      const isComponent = selectedElement && selectedElement.type === 'component';

      if (isBoundary || isContainer || isComponent) {
        scopeIds = collectDescendantIds(c4Model.elements, selectedElementId);
      }
    }

    const filteredElements = c4Model.elements.filter(e => {
      if (e.type !== targetType) return false;
      if (scopeIds && !scopeIds.has(e.id)) return false;
      return true;
    });

    if (filteredElements.length === 0) return c4Model;

    const filteredIds = new Set(filteredElements.map(e => e.id));
    const filteredRelationships = c4Model.relationships.filter(
      r => filteredIds.has(r.from) || filteredIds.has(r.to),
    );

    return { ...c4Model, elements: filteredElements, relationships: filteredRelationships };
  }, [c4Model, boundaryInfos, dsmLevel, currentLevel, selectedElementId]);

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
        <Button size="small" onClick={() => { if (showDsm && !showC4) return; setShowDsm(prev => !prev); }} aria-pressed={showDsm} aria-label="Toggle DSM matrix" sx={{ ...toolbarButtonSx, ...(showDsm && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>DSM</Button>
        <Button size="small" startIcon={<AccountTreeIcon sx={{ fontSize: 18 }} />} onClick={() => setShowTree(prev => !prev)} aria-pressed={showTree} aria-label="Toggle element tree" sx={{ ...toolbarButtonSx, ...(showTree && { bgcolor: 'rgba(144,202,249,0.12)' }) }}>Tree</Button>
      </Toolbar>
      <Box ref={containerRef} sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {showC4 && (
          <Box sx={{ flex: showDsm ? splitRatio : 1, position: 'relative', minWidth: 100 }}>
            <GraphCanvas document={state.document} viewport={state.document.viewport} dispatch={dispatch} canvasRef={canvasRef}
              selectedNodeId={selectedElementId ? (state.document.nodes.find(n => n.metadata?.c4Id === selectedElementId)?.id ?? null) : null} />
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
            {dsmModel ? (
              <DsmCanvas model={dsmModel} fullModel={c4Model ?? undefined} boundaries={boundaryInfos} level={dsmLevel} clustered={dsmClustered} focusedNodeId={selectedElementId} />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>Waiting for C4 model...</Typography>
              </Box>
            )}
          </Box>
        )}
        {showTree && elementTree.length > 0 && (
          <C4ElementTree tree={elementTree} dispatch={dispatch} onSelect={setSelectedElementId} />
        )}
      </Box>
    </Box>
  );
}
