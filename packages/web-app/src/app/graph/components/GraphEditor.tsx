'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Box } from '@mui/material';
import { ToolType, GraphDocument, createDocument } from '../types';
import { useGraphState } from '../hooks/useGraphState';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import { useAutoSave } from '../hooks/useAutoSave';
import { GraphToolBar } from './ToolBar';
import { GraphCanvas } from './GraphCanvas';
import { PropertyPanel } from './PropertyPanel';
import { TextEditOverlay } from './TextEditOverlay';
import { DocEditorModal } from './DocEditorModal';
import { ShapeHoverBar } from './ShapeHoverBar';
import { zoom as zoomViewport, fitToContent } from '../engine/viewport';
import { alignLeft, alignRight, alignTop, alignBottom, alignCenterH, alignCenterV, distributeH, distributeV } from '../engine/alignment';
import { loadDocument, getLastDocumentId } from '../store/graphStorage';
import { exportToSvg, exportToDrawio, importFromDrawio } from '@anytime-markdown/graph-core';

export function GraphEditor() {
  const [tool, setTool] = useState<ToolType>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [showProperty, setShowProperty] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [docEditNodeId, setDocEditNodeId] = useState<string | null>(null);
  const { state, dispatch } = useGraphState();

  useEffect(() => {
    const lastId = getLastDocumentId();
    if (lastId) {
      loadDocument(lastId).then(doc => {
        if (doc) dispatch({ type: 'SET_DOCUMENT', doc });
      });
    }
  }, [dispatch]);

  useAutoSave(state.document);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // 右クリック = 選択解除（ESCと同じ動作）
    dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [] } });
    setEditingNodeId(null);
    setDocEditNodeId(null);
  }, [dispatch]);

  const handleTextEdit = useCallback((nodeId: string) => {
    const node = state.document.nodes.find(n => n.id === nodeId);
    if (node?.type === 'doc') {
      setDocEditNodeId(nodeId);
    } else {
      setEditingNodeId(nodeId);
    }
  }, [state.document.nodes]);

  const {
    handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleDoubleClick, previewRef, dragRef,
    clipboardRef, copySelected, pasteFromClipboard, hoverNodeIdRef, mouseWorldRef,
  } = useCanvasInteraction({
    canvasRef, tool,
    nodes: state.document.nodes,
    edges: state.document.edges,
    viewport: state.document.viewport,
    selection: state.selection,
    dispatch,
    onTextEdit: handleTextEdit,
    onToolChange: setTool,
    showGrid,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingNodeId) return;
      const map: Record<string, ToolType> = {
        v: 'select', r: 'rect', o: 'ellipse', s: 'sticky',
        t: 'text', d: 'diamond', p: 'parallelogram', y: 'cylinder',
        i: 'insight', m: 'doc', f: 'frame',
        l: 'line', a: 'arrow', c: 'connector',
      };
      if (map[e.key] && !e.ctrlKey && !e.metaKey) {
        setTool(map[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingNodeId]);

  const handleTextCommit = useCallback((id: string, text: string) => {
    dispatch({ type: 'UPDATE_NODE', id, changes: { text } });
    setEditingNodeId(null);
  }, [dispatch]);

  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dispatch({
      type: 'SET_VIEWPORT',
      viewport: zoomViewport(state.document.viewport, rect.width / 2, rect.height / 2, -1),
    });
  }, [state.document.viewport, dispatch]);

  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dispatch({
      type: 'SET_VIEWPORT',
      viewport: zoomViewport(state.document.viewport, rect.width / 2, rect.height / 2, 1),
    });
  }, [state.document.viewport, dispatch]);

  const handleFitContent = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nodes = state.document.nodes;
    if (nodes.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const minX = Math.min(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxX = Math.max(...nodes.map(n => n.x + n.width));
    const maxY = Math.max(...nodes.map(n => n.y + n.height));
    dispatch({
      type: 'SET_VIEWPORT',
      viewport: fitToContent(rect.width, rect.height, { minX, minY, maxX, maxY }),
    });
  }, [state.document.nodes, dispatch]);

  const handleClearAll = useCallback(() => {
    dispatch({ type: 'SET_DOCUMENT', doc: createDocument('Untitled') });
  }, [dispatch]);

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
        const doc = importFromDrawio(xml);
        dispatch({ type: 'SET_DOCUMENT', doc });
      };
      reader.readAsText(file);
    };
    input.click();
  }, [dispatch]);

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
    dispatch({
      type: 'ALIGN_NODES',
      updates: result.map(n => ({ id: n.id, x: n.x, y: n.y })),
    });
  }, [state.document.nodes, state.selection.nodeIds, dispatch]);

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
    dispatch({ type: 'UPDATE_NODE', id: nodeId, changes: { zIndex: newZ } });
  }, [state.selection.nodeIds, state.document.nodes, dispatch]);

  const selectedNode = state.selection.nodeIds.length === 1
    ? state.document.nodes.find(n => n.id === state.selection.nodeIds[0]) ?? null : null;
  const selectedEdge = state.selection.edgeIds.length === 1
    ? state.document.edges.find(e => e.id === state.selection.edgeIds[0]) ?? null : null;
  const editingNode = editingNodeId ? state.document.nodes.find(n => n.id === editingNodeId) ?? null : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <GraphToolBar
        tool={tool}
        onToolChange={setTool}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        canUndo={state.historyIndex > 0}
        canRedo={state.historyIndex < state.history.length - 1}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(v => !v)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitContent={handleFitContent}
        onClearAll={handleClearAll}
        onExportSvg={handleExportSvg}
        onExportDrawio={handleExportDrawio}
        onImportDrawio={handleImportDrawio}
        onAlign={handleAlign}
        selectionCount={state.selection.nodeIds.length}
        hasSelection={state.selection.nodeIds.length > 0 || state.selection.edgeIds.length > 0}
        scale={state.document.viewport.scale}
      />
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <GraphCanvas
          nodes={state.document.nodes}
          edges={state.document.edges}
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
        />
        {selectedNode && !editingNodeId && !docEditNodeId && !isDragging && (
          <ShapeHoverBar
            node={selectedNode}
            viewport={state.document.viewport}
            onChangeType={(id, type) => dispatch({ type: 'UPDATE_NODE', id, changes: { type } })}
          />
        )}
        <TextEditOverlay
          node={editingNode}
          viewport={state.document.viewport}
          onCommit={handleTextCommit}
          onCancel={() => setEditingNodeId(null)}
        />
        {showProperty && (selectedNode || selectedEdge) && (
          <PropertyPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onUpdateNode={(id, changes) => dispatch({ type: 'UPDATE_NODE', id, changes })}
            onUpdateEdge={(id, changes) => dispatch({ type: 'UPDATE_EDGE', id, changes })}
            onLayerAction={handleLayerAction}
            onClose={() => setShowProperty(false)}
          />
        )}
      </Box>
      <DocEditorModal
        open={docEditNodeId !== null}
        title={state.document.nodes.find(n => n.id === docEditNodeId)?.text ?? ''}
        content={state.document.nodes.find(n => n.id === docEditNodeId)?.docContent ?? ''}
        onSave={(content) => {
          if (docEditNodeId) {
            dispatch({ type: 'UPDATE_NODE', id: docEditNodeId, changes: { docContent: content } });
          }
        }}
        onClose={() => setDocEditNodeId(null)}
      />
    </Box>
  );
}
