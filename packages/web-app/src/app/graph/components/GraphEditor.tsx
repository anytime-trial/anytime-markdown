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
import { zoom as zoomViewport, fitToContent } from '../engine/viewport';
import { loadDocument, getLastDocumentId } from '../store/graphStorage';

export function GraphEditor() {
  const [tool, setTool] = useState<ToolType>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [showProperty, setShowProperty] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const handleTextEdit = useCallback((nodeId: string) => {
    setEditingNodeId(nodeId);
  }, []);

  const {
    handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleDoubleClick, previewRef,
  } = useCanvasInteraction({
    canvasRef, tool,
    nodes: state.document.nodes,
    edges: state.document.edges,
    viewport: state.document.viewport,
    selection: state.selection,
    dispatch,
    onTextEdit: handleTextEdit,
    showGrid,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingNodeId) return;
      const map: Record<string, ToolType> = {
        v: 'select', r: 'rect', o: 'ellipse', s: 'sticky',
        t: 'text', l: 'line', a: 'arrow', c: 'connector',
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
        onDelete={() => dispatch({ type: 'DELETE_SELECTED' })}
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
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          previewRef={previewRef}
        />
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
            onClose={() => setShowProperty(false)}
          />
        )}
      </Box>
    </Box>
  );
}
