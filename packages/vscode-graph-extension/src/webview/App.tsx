import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Typography, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import type { ToolType, GraphDocument, GraphNode, GraphEdge, Viewport } from '@anytime-markdown/graph-core';
import { createDocument, createNode } from '@anytime-markdown/graph-core';
import {
  zoom as zoomViewport, fitToContent, screenToWorld,
  alignLeft, alignRight, alignTop, alignBottom,
  alignCenterH, alignCenterV, distributeH, distributeV,
  physics,
} from '@anytime-markdown/graph-core/engine';
import { pan as panViewport } from '@anytime-markdown/graph-core/engine';
import type { ViewportAnimation } from '@anytime-markdown/graph-core/engine';
import { exportToSvg, exportToDrawio, importFromDrawio } from '@anytime-markdown/graph-core';
import { GraphToolBar } from '../../../web-app/src/app/graph/components/ToolBar';
import { PropertyPanel } from '../../../web-app/src/app/graph/components/PropertyPanel';
import { ShapeHoverBar } from '../../../web-app/src/app/graph/components/ShapeHoverBar';
import { DocEditorModal } from '../../../web-app/src/app/graph/components/DocEditorModal';
import { DetailPanel } from '../../../web-app/src/app/graph/components/DetailPanel';
import { FilterPanel } from '../../../web-app/src/app/graph/components/FilterPanel';
import type { SaveStatus } from '../../../web-app/src/app/graph/hooks/useAutoSave';
import { useDataMapping } from '../../../web-app/src/app/graph/hooks/useDataMapping';
import { useNodeFilter } from '../../../web-app/src/app/graph/hooks/useNodeFilter';
import { usePathHighlight } from '../../../web-app/src/app/graph/hooks/usePathHighlight';
import type { DataMappingConfig } from '../../../web-app/src/app/graph/types/dataMapping';
import type { NodeFilterConfig } from '../../../web-app/src/app/graph/types/nodeFilter';
import { EMPTY_FILTER } from '../../../web-app/src/app/graph/types/nodeFilter';
import { useThemeMode } from './shims/providers';
import { useGraphState } from './hooks/useGraphState';
import { useCanvasInteraction } from './hooks/useCanvasInteraction';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { GraphCanvas } from './components/GraphCanvas';
import { TextEditOverlay } from './components/TextEditOverlay';
import { useTranslations } from 'next-intl';

export function App() {
  const t = useTranslations('Graph');
  const { state, dispatch } = useGraphState();
  const [tool, setTool] = useState<ToolType>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [textEditAppendMode, setTextEditAppendMode] = useState(false);
  const [docEditNodeId, setDocEditNodeId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [layoutAlgorithm, setLayoutAlgorithm] = useState<'eades' | 'fruchterman-reingold' | 'eades-vpsc' | 'fruchterman-reingold-vpsc'>('eades');
  const [collisionEnabled, setCollisionEnabled] = useState(false);
  const [dataMappingConfig, setDataMappingConfig] = useState<DataMappingConfig | undefined>(undefined);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const [filterConfig, setFilterConfig] = useState<NodeFilterConfig>(EMPTY_FILTER);
  const [showFilter, setShowFilter] = useState(false);
  const [showProperty, setShowProperty] = useState(true);
  const physicsRef = useRef<physics.PhysicsEngine | null>(null);
  const documentRef = useRef(state.document);
  const nodesRef = useRef(state.document.nodes);
  const edgesRef = useRef(state.document.edges);
  documentRef.current = state.document;
  nodesRef.current = state.document.nodes;
  edgesRef.current = state.document.edges;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { nodes: filteredNodes, edges: filteredEdges } = useNodeFilter(
    state.document.nodes, state.document.edges, filterConfig,
  );
  const { nodes: displayNodes, edges: displayEdges } = useDataMapping(
    filteredNodes, filteredEdges, dataMappingConfig,
  );
  const {
    highlightNodeIds, highlightEdgeIds, originNodeId,
    setOriginNodeId, setHoverTargetId,
  } = usePathHighlight(state.document.edges);

  const availableMetadataKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const node of state.document.nodes) {
      if (node.metadata) {
        for (const key of Object.keys(node.metadata)) keys.add(key);
      }
    }
    return [...keys].sort();
  }, [state.document.nodes]);

  const metadataKeyRanges = useMemo(() => {
    const ranges = new Map<string, [number, number]>();
    for (const node of state.document.nodes) {
      if (!node.metadata) continue;
      for (const [key, val] of Object.entries(node.metadata)) {
        if (typeof val !== 'number') continue;
        const existing = ranges.get(key);
        if (existing) {
          existing[0] = Math.min(existing[0], val);
          existing[1] = Math.max(existing[1], val);
        } else {
          ranges.set(key, [val, val]);
        }
      }
    }
    return ranges;
  }, [state.document.nodes]);

  const { themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  const theme = useMemo(() => createTheme({ palette: { mode: themeMode } }), [themeMode]);

  const { saveDocument } = useVSCodeMessaging({
    onLoad: useCallback((doc: GraphDocument) => {
      dispatch({ type: 'SET_DOCUMENT', doc });
    }, [dispatch]),
    onTheme: useCallback(() => {}, []),
  });

  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveDocument(documentRef.current);
    }, 500);
  }, [saveDocument]);

  const wrappedDispatch = useCallback((action: any) => {
    dispatch(action);
    if (action.type !== 'SET_DOCUMENT' && action.type !== 'SET_SELECTION' && action.type !== 'SET_VIEWPORT') {
      scheduleAutoSave();
    }
  }, [dispatch, scheduleAutoSave]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [] } });
    setEditingNodeId(null);
    setDocEditNodeId(null);
  }, [dispatch]);

  const handleTextEdit = useCallback((nodeId: string) => {
    const node = state.document.nodes.find(n => n.id === nodeId);
    if (node?.type === 'doc') {
      setDocEditNodeId(nodeId);
    } else {
      setTextEditAppendMode(false);
      setEditingNodeId(nodeId);
    }
  }, [state.document.nodes]);

  const {
    handleMouseDown, handleMouseMove, handleMouseUp,
    handleWheel, handleDoubleClick, previewRef, dragRef,
    hoverNodeIdRef, mouseWorldRef, velocityRef,
  } = useCanvasInteraction({
    canvasRef, tool,
    nodes: state.document.nodes, edges: state.document.edges,
    viewport: state.document.viewport, selection: state.selection,
    dispatch: wrappedDispatch, onTextEdit: handleTextEdit, onToolChange: setTool, showGrid,
    isDark, collisionEnabled, physicsRef,
  });

  // Keyboard: arrow keys, tool shortcuts, printable key edit
  const selectionRef = useRef(state.selection);
  selectionRef.current = state.selection;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.getAttribute('contenteditable') === 'true') return;
      if (editingNodeId) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const ids = selectionRef.current.nodeIds;
        if (ids.length === 0) return;
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        if (dx !== 0 || dy !== 0) {
          wrappedDispatch({ type: 'MOVE_NODES', ids, dx, dy });
          e.preventDefault();
        }
        return;
      }

      const ids = selectionRef.current.nodeIds;
      if (ids.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        const node = state.document.nodes.find(n => n.id === ids[0]);
        if (node && node.type !== 'image' && node.type !== 'doc' && !node.locked) {
          e.preventDefault();
          setTextEditAppendMode(true);
          handleTextEdit(ids[0]);
          return;
        }
      }

      const map: Record<string, ToolType> = {
        v: 'select', r: 'rect', o: 'ellipse', s: 'sticky',
        t: 'text', d: 'diamond', p: 'parallelogram', y: 'cylinder',
        m: 'doc', f: 'frame',
        l: 'line', a: 'arrow', c: 'connector',
      };
      if (map[e.key] && !e.ctrlKey && !e.metaKey) {
        setTool(map[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingNodeId, wrappedDispatch, state.document.nodes, handleTextEdit]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && selectionRef.current.nodeIds.length === 1) {
        const selectedId = selectionRef.current.nodeIds[0];
        setOriginNodeId(originNodeId === selectedId ? null : selectedId);
      }
    };
    globalThis.addEventListener('click', handler);
    return () => globalThis.removeEventListener('click', handler);
  }, [setOriginNodeId, originNodeId]);

  // Accessibility: node count change notification
  const prevNodeCountRef = useRef(state.document.nodes.length);
  useEffect(() => {
    const currentCount = state.document.nodes.length;
    const prevCount = prevNodeCountRef.current;
    if (currentCount > prevCount) setLiveMessage(t('nodeAdded'));
    else if (currentCount < prevCount) setLiveMessage(t('nodeDeleted'));
    prevNodeCountRef.current = currentCount;
  }, [state.document.nodes.length, t]);

  // Accessibility: selection notification
  useEffect(() => {
    const { nodeIds, edgeIds } = state.selection;
    if (nodeIds.length > 0 || edgeIds.length > 0) {
      setLiveMessage(`${nodeIds.length} ${t('nodesSelected')}, ${edgeIds.length} ${t('edgesSelected')}`);
    } else {
      setLiveMessage('');
    }
  }, [state.selection, t]);

  useEffect(() => {
    const { nodeIds, edgeIds } = state.selection;
    if (nodeIds.length > 0 || edgeIds.length > 0) {
      setShowProperty(true);
    }
  }, [state.selection]);

  // Viewport animation
  const viewportAnimRef = useRef<ViewportAnimation | null>(null);

  const startViewportAnimation = useCallback((to: Viewport) => {
    viewportAnimRef.current = {
      from: { ...state.document.viewport },
      to,
      startTime: performance.now(),
      duration: 200,
    };
  }, [state.document.viewport]);

  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const target = zoomViewport(state.document.viewport, rect.width / 2, rect.height / 2, -300);
    startViewportAnimation(target);
  }, [state.document.viewport, startViewportAnimation]);

  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const target = zoomViewport(state.document.viewport, rect.width / 2, rect.height / 2, 300);
    startViewportAnimation(target);
  }, [state.document.viewport, startViewportAnimation]);

  const handleSetScale = useCallback((newScale: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const vp = state.document.viewport;
    const worldCenterX = (cx - vp.offsetX) / vp.scale;
    const worldCenterY = (cy - vp.offsetY) / vp.scale;
    const target: Viewport = {
      offsetX: cx - worldCenterX * newScale,
      offsetY: cy - worldCenterY * newScale,
      scale: newScale,
    };
    startViewportAnimation(target);
  }, [state.document.viewport, startViewportAnimation]);

  const handleFitToContent = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nodes = state.document.nodes;
    if (nodes.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const minX = Math.min(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxX = Math.max(...nodes.map(n => n.x + n.width));
    const maxY = Math.max(...nodes.map(n => n.y + n.height));
    const target = fitToContent(rect.width, rect.height, { minX, minY, maxX, maxY });
    startViewportAnimation(target);
  }, [state.document.nodes, startViewportAnimation]);

  const handleViewportUpdate = useCallback((vp: Viewport) => {
    dispatch({ type: 'SET_VIEWPORT', viewport: vp });
  }, [dispatch]);

  const handlePanInertia = useCallback((dx: number, dy: number) => {
    dispatch({ type: 'SET_VIEWPORT', viewport: panViewport(state.document.viewport, dx, dy) });
  }, [state.document.viewport, dispatch]);

  const handleDropImage = useCallback((dataUrl: string, sx: number, sy: number, w: number, h: number) => {
    const world = screenToWorld(state.document.viewport, sx, sy);
    const node = createNode('image', world.x - w / 2, world.y - h / 2, {
      width: w, height: h, imageData: dataUrl,
    }, isDark);
    wrappedDispatch({ type: 'ADD_NODE', node });
  }, [state.document.viewport, wrappedDispatch, isDark]);

  const handleAlign = useCallback((type: string) => {
    const selectedNodes = state.document.nodes.filter(n => state.selection.nodeIds.includes(n.id));
    if (selectedNodes.length < 2) return;
    const fns: Record<string, (rects: typeof selectedNodes) => typeof selectedNodes> = {
      left: alignLeft, right: alignRight, top: alignTop, bottom: alignBottom,
      centerH: alignCenterH, centerV: alignCenterV, distributeH, distributeV,
    };
    const fn = fns[type];
    if (!fn) return;
    const result = fn(selectedNodes);
    wrappedDispatch({
      type: 'ALIGN_NODES',
      updates: result.map(n => ({ id: n.id, x: n.x, y: n.y })),
    });
  }, [state.document.nodes, state.selection.nodeIds, wrappedDispatch]);

  const handleAutoLayout = useCallback(() => {
    if (layoutRunning) return;
    setLayoutRunning(true);
    wrappedDispatch({ type: 'SNAPSHOT' });
    const engine = new physics.PhysicsEngine({ collisionEnabled: true, algorithm: layoutAlgorithm });
    engine.initLayout(nodesRef.current, edgesRef.current);
    physicsRef.current = engine;
    const loop = () => {
      const running = engine.tick();
      const positions = engine.getPositions();
      const updates: Array<{ id: string; x: number; y: number }> = [];
      for (const [id, pos] of positions) updates.push({ id, x: pos.x, y: pos.y });
      dispatch({ type: 'SET_NODE_POSITIONS', updates });
      if (running) {
        requestAnimationFrame(loop);
      } else {
        const spreadPositions = engine.spreadConnected(null, edgesRef.current, 100);
        const spreadUpdates: Array<{ id: string; x: number; y: number }> = [];
        for (const [id, pos] of spreadPositions) spreadUpdates.push({ id, x: pos.x, y: pos.y });
        dispatch({ type: 'SET_NODE_POSITIONS', updates: spreadUpdates });
        setLayoutRunning(false);
        wrappedDispatch({ type: 'SNAPSHOT' });
      }
    };
    requestAnimationFrame(loop);
  }, [layoutRunning, layoutAlgorithm, dispatch, wrappedDispatch]);

  const handleSpreadConnected = useCallback(() => {
    wrappedDispatch({ type: 'SNAPSHOT' });
    const engine = new physics.PhysicsEngine();
    const positions = engine.spreadConnected(nodesRef.current, edgesRef.current, 100);
    const updates: Array<{ id: string; x: number; y: number }> = [];
    for (const [id, pos] of positions) updates.push({ id, x: pos.x, y: pos.y });
    wrappedDispatch({ type: 'SET_NODE_POSITIONS', updates });
    wrappedDispatch({ type: 'SNAPSHOT' });
  }, [wrappedDispatch]);

  const handleClearAll = useCallback(() => {
    setConfirmDialog({
      open: true,
      title: t('clearAll'),
      message: t('clearAllConfirm'),
      onConfirm: () => wrappedDispatch({ type: 'SET_DOCUMENT', doc: createDocument('Untitled') }),
    });
  }, [wrappedDispatch, t]);

  const handleExportSvg = useCallback(() => {
    const svg = exportToSvg(state.document);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.document.name || 'graph'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.document]);

  const handleExportDrawio = useCallback(() => {
    const xml = exportToDrawio(state.document);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.document.name || 'graph'}.drawio`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.document]);

  const handleImportDrawio = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.drawio,.xml';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const xml = reader.result as string;
        setConfirmDialog({
          open: true,
          title: t('import'),
          message: t('importConfirm'),
          onConfirm: () => {
            const doc = importFromDrawio(xml);
            wrappedDispatch({ type: 'SET_DOCUMENT', doc });
          },
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }, [wrappedDispatch, t]);

  const handleLayerAction = useCallback((action: 'up' | 'down' | 'top' | 'bottom') => {
    if (state.selection.nodeIds.length !== 1) return;
    const nodeId = state.selection.nodeIds[0];
    const node = state.document.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const currentZ = node.zIndex ?? 0;
    const allZ = state.document.nodes.filter(n => n.id !== nodeId).map(n => n.zIndex ?? 0);
    const maxZ = allZ.length > 0 ? Math.max(...allZ) : 0;
    const minZ = allZ.length > 0 ? Math.min(...allZ) : 0;
    let newZ = currentZ;
    if (action === 'up') newZ = currentZ + 1;
    else if (action === 'down') newZ = currentZ - 1;
    else if (action === 'top') newZ = maxZ + 1;
    else if (action === 'bottom') newZ = minZ - 1;
    wrappedDispatch({ type: 'UPDATE_NODE', id: nodeId, changes: { zIndex: newZ } });
  }, [state.selection.nodeIds, state.document.nodes, wrappedDispatch]);

  const handleTextCommit = useCallback((id: string, text: string) => {
    wrappedDispatch({ type: 'UPDATE_NODE', id, changes: { text } });
    setEditingNodeId(null);
    setTextEditAppendMode(false);
  }, [wrappedDispatch]);

  const saveStatus: SaveStatus = 'saved';
  const selectedNode = state.selection.nodeIds.length === 1
    ? state.document.nodes.find(n => n.id === state.selection.nodeIds[0]) ?? null : null;
  const selectedEdge = state.selection.edgeIds.length === 1
    ? state.document.edges.find(e => e.id === state.selection.edgeIds[0]) ?? null : null;
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <GraphToolBar
          tool={tool}
          onToolChange={setTool}
          onUndo={() => { wrappedDispatch({ type: 'UNDO' }); setLiveMessage(t('undone')); }}
          onRedo={() => { wrappedDispatch({ type: 'REDO' }); setLiveMessage(t('redone')); }}
          canUndo={state.historyIndex > 0}
          canRedo={state.historyIndex < state.history.length - 1}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid(g => !g)}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitContent={handleFitToContent}
          onClearAll={handleClearAll}
          onExportSvg={handleExportSvg}
          onExportDrawio={handleExportDrawio}
          onImportDrawio={handleImportDrawio}
          onAlign={handleAlign}
          onSetScale={handleSetScale}
          selectionCount={state.selection.nodeIds.length}
          hasSelection={state.selection.nodeIds.length > 0 || state.selection.edgeIds.length > 0}
          scale={state.document.viewport.scale}
          saveStatus={saveStatus}
          layoutRunning={layoutRunning}
          collisionEnabled={collisionEnabled}
          onAutoLayout={handleAutoLayout}
          onToggleCollision={setCollisionEnabled}
          layoutAlgorithm={layoutAlgorithm}
          onChangeAlgorithm={setLayoutAlgorithm}
          onSpreadConnected={handleSpreadConnected}
          showFilter={showFilter}
          onToggleFilter={() => setShowFilter(v => !v)}
          filterActive={filterConfig.rangeFilters.length > 0 || filterConfig.textFilters.length > 0}
        />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <GraphCanvas
            nodes={displayNodes as GraphNode[]}
            edges={displayEdges as GraphEdge[]}
            viewport={state.document.viewport}
            selection={state.selection}
            showGrid={showGrid}
            canvasRef={canvasRef}
            onMouseDown={(e) => { setIsDragging(true); handleMouseDown(e); }}
            onMouseMove={handleMouseMove}
            onMouseUp={(e) => { setIsDragging(false); handleMouseUp(e); }}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            previewRef={previewRef}
            hoverNodeIdRef={hoverNodeIdRef}
            mouseWorldRef={mouseWorldRef}
            onDropImage={handleDropImage}
            viewportAnimRef={viewportAnimRef}
            onViewportUpdate={handleViewportUpdate}
            velocityRef={velocityRef}
            onPanInertia={handlePanInertia}
            draggingNodeIds={isDragging && dragRef.current.type === 'move' ? state.selection.nodeIds : undefined}
            ariaLabel={t('graphCanvas')}
            isDark={isDark}
            layoutRunning={layoutRunning}
            onNodeHover={useCallback((id: string | null) => {
              setDetailNodeId(id);
              setHoverTargetId(id);
            }, [setHoverTargetId])}
            highlightNodeIds={highlightNodeIds}
            highlightEdgeIds={highlightEdgeIds}
            originNodeId={originNodeId}
          />
          {state.document.nodes.length === 0 && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)',
              textAlign: 'center', pointerEvents: 'none', zIndex: 10,
            }}>
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 300 }}>{t('emptyCanvasTitle')}</Typography>
              <Typography variant="body2">{t('emptyCanvasHint')}</Typography>
            </div>
          )}
          {selectedNode && !editingNodeId && !docEditNodeId && !isDragging && (
            <ShapeHoverBar
              node={selectedNode}
              viewport={state.document.viewport}
              onChangeType={(id, type) => wrappedDispatch({ type: 'UPDATE_NODE', id, changes: { type } })}
            />
          )}
          <TextEditOverlay
            node={editingNodeId ? state.document.nodes.find(n => n.id === editingNodeId) ?? null : null}
            viewport={state.document.viewport}
            onCommit={handleTextCommit}
            onCancel={() => { setEditingNodeId(null); setTextEditAppendMode(false); }}
            appendMode={textEditAppendMode}
          />
          {showProperty && (selectedNode || selectedEdge) && (
            <PropertyPanel
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onUpdateNode={(id, changes) => wrappedDispatch({ type: 'UPDATE_NODE', id, changes })}
              onUpdateEdge={(id, changes) => wrappedDispatch({ type: 'UPDATE_EDGE', id, changes })}
              onLayerAction={handleLayerAction}
              onClose={() => {
                setShowProperty(false);
              }}
            />
          )}
          {detailNodeId && !showProperty && (() => {
            const detailNode = state.document.nodes.find(n => n.id === detailNodeId);
            return detailNode ? (
              <DetailPanel node={detailNode} onClose={() => setDetailNodeId(null)} />
            ) : null;
          })()}
          {showFilter && (
            <FilterPanel
              config={filterConfig}
              onConfigChange={setFilterConfig}
              availableKeys={availableMetadataKeys}
              keyRanges={metadataKeyRanges}
              onClose={() => setShowFilter(false)}
            />
          )}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
          >
            {liveMessage}
          </div>
        </div>
      </div>
      <DocEditorModal
        open={docEditNodeId !== null}
        title={state.document.nodes.find(n => n.id === docEditNodeId)?.text ?? ''}
        content={state.document.nodes.find(n => n.id === docEditNodeId)?.docContent ?? ''}
        onSave={(content) => {
          if (docEditNodeId) {
            wrappedDispatch({ type: 'UPDATE_NODE', id: docEditNodeId, changes: { docContent: content } });
          }
        }}
        onClose={() => setDocEditNodeId(null)}
      />
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: () => {} })}>
        <DialogTitle>{confirmDialog.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirmDialog.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: () => {} })}>{t('cancel')}</Button>
          <Button
            onClick={() => {
              confirmDialog.onConfirm();
              setConfirmDialog({ open: false, title: '', message: '', onConfirm: () => {} });
            }}
            color="error"
            autoFocus
          >
            {t('confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
