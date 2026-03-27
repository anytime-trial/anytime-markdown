import { useState, useRef, useCallback, useMemo } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import type { ToolType, GraphDocument } from '@anytime-markdown/graph-core';
import {
  zoom as zoomViewport, fitToContent,
  alignLeft, alignRight, alignTop, alignBottom,
  alignCenterH, alignCenterV, distributeH, distributeV,
} from '@anytime-markdown/graph-core/engine';
import { physics } from '@anytime-markdown/graph-core/engine';
import { exportToSvg, exportToDrawio, importFromDrawio, createDocument } from '@anytime-markdown/graph-core';
import { GraphToolBar } from '../../../web-app/src/app/graph/components/ToolBar';
import { PropertyPanel } from '../../../web-app/src/app/graph/components/PropertyPanel';
import { ShapeHoverBar } from '../../../web-app/src/app/graph/components/ShapeHoverBar';
import type { SaveStatus } from '../../../web-app/src/app/graph/hooks/useAutoSave';
import { useThemeMode } from './shims/providers';
import { useGraphState } from './hooks/useGraphState';
import { useCanvasInteraction } from './hooks/useCanvasInteraction';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { GraphCanvas } from './components/GraphCanvas';
import { TextEditOverlay } from './components/TextEditOverlay';

export function App() {
  const { state, dispatch } = useGraphState();
  const [tool, setTool] = useState<ToolType>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [layoutAlgorithm, setLayoutAlgorithm] = useState<'eades' | 'fruchterman-reingold' | 'eades-vpsc' | 'fruchterman-reingold-vpsc'>('eades');
  const [collisionEnabled, setCollisionEnabled] = useState(false);
  const physicsRef = useRef<physics.PhysicsEngine | null>(null);
  const nodesRef = useRef(state.document.nodes);
  const edgesRef = useRef(state.document.edges);
  nodesRef.current = state.document.nodes;
  edgesRef.current = state.document.edges;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { themeMode } = useThemeMode();
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
      saveDocument(state.document);
    }, 500);
  }, [saveDocument, state.document]);

  const wrappedDispatch = useCallback((action: any) => {
    dispatch(action);
    if (action.type !== 'SET_DOCUMENT' && action.type !== 'SET_SELECTION' && action.type !== 'SET_VIEWPORT') {
      scheduleAutoSave();
    }
  }, [dispatch, scheduleAutoSave]);

  const {
    handleMouseDown, handleMouseMove, handleMouseUp,
    handleWheel, handleDoubleClick, previewRef,
  } = useCanvasInteraction({
    canvasRef, tool,
    nodes: state.document.nodes, edges: state.document.edges,
    viewport: state.document.viewport, selection: state.selection,
    dispatch: wrappedDispatch, onTextEdit: setEditingNodeId, showGrid,
    collisionEnabled, physicsRef,
  });

  const handleZoomIn = useCallback(() => {
    const vp = state.document.viewport;
    dispatch({ type: 'SET_VIEWPORT', viewport: zoomViewport(vp, window.innerWidth / 2, window.innerHeight / 2, -1) });
  }, [state.document.viewport, dispatch]);

  const handleZoomOut = useCallback(() => {
    const vp = state.document.viewport;
    dispatch({ type: 'SET_VIEWPORT', viewport: zoomViewport(vp, window.innerWidth / 2, window.innerHeight / 2, 1) });
  }, [state.document.viewport, dispatch]);

  const handleFitToContent = useCallback(() => {
    const nodes = state.document.nodes;
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxX = Math.max(...nodes.map(n => n.x + n.width));
    const maxY = Math.max(...nodes.map(n => n.y + n.height));
    dispatch({ type: 'SET_VIEWPORT', viewport: fitToContent(window.innerWidth, window.innerHeight - 40, { minX, minY, maxX, maxY }) });
  }, [state.document.nodes, dispatch]);

  const handleSetScale = useCallback((scale: number) => {
    dispatch({ type: 'SET_VIEWPORT', viewport: { ...state.document.viewport, scale } });
  }, [state.document.viewport, dispatch]);

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
    if (window.confirm('Clear all nodes and edges?')) {
      wrappedDispatch({ type: 'SET_DOCUMENT', doc: createDocument('Untitled') });
    }
  }, [wrappedDispatch]);

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
        if (window.confirm('Import will replace current graph. Continue?')) {
          const doc = importFromDrawio(xml);
          wrappedDispatch({ type: 'SET_DOCUMENT', doc });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [wrappedDispatch]);

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

  const saveStatus: SaveStatus = 'saved';
  const selectedNode = state.selection.nodeIds.length === 1
    ? state.document.nodes.find(n => n.id === state.selection.nodeIds[0]) ?? null : null;
  const selectedEdge = state.selection.edgeIds.length === 1
    ? state.document.edges.find(e => e.id === state.selection.edgeIds[0]) ?? null : null;
  const editingNode = editingNodeId ? state.document.nodes.find(n => n.id === editingNodeId) : null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <GraphToolBar
          tool={tool}
          onToolChange={setTool}
          onUndo={() => wrappedDispatch({ type: 'UNDO' })}
          onRedo={() => wrappedDispatch({ type: 'REDO' })}
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
          hasSelection={state.selection.nodeIds.length > 0}
          scale={state.document.viewport.scale}
          saveStatus={saveStatus}
          layoutRunning={layoutRunning}
          collisionEnabled={collisionEnabled}
          onAutoLayout={handleAutoLayout}
          onToggleCollision={setCollisionEnabled}
          layoutAlgorithm={layoutAlgorithm}
          onChangeAlgorithm={setLayoutAlgorithm}
          onSpreadConnected={handleSpreadConnected}
        />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <GraphCanvas
            nodes={state.document.nodes}
            edges={state.document.edges}
            viewport={state.document.viewport}
            selection={state.selection}
            showGrid={showGrid}
            previewRef={previewRef}
            canvasRef={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
          />
          {selectedNode && !editingNodeId && (
            <ShapeHoverBar
              node={selectedNode}
              viewport={state.document.viewport}
              onChangeType={(id, type) => wrappedDispatch({ type: 'UPDATE_NODE', id, changes: { type } })}
            />
          )}
          {editingNode && (
            <TextEditOverlay
              node={editingNode}
              viewport={state.document.viewport}
              onCommit={(text) => {
                wrappedDispatch({ type: 'UPDATE_NODE', id: editingNode.id, changes: { text } });
                setEditingNodeId(null);
              }}
              onCancel={() => setEditingNodeId(null)}
            />
          )}
          {(selectedNode || selectedEdge) && (
            <PropertyPanel
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onUpdateNode={(id, changes) => wrappedDispatch({ type: 'UPDATE_NODE', id, changes })}
              onUpdateEdge={(id, changes) => wrappedDispatch({ type: 'UPDATE_EDGE', id, changes })}
              onLayerAction={handleLayerAction}
              onClose={() => wrappedDispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [] } })}
            />
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}
