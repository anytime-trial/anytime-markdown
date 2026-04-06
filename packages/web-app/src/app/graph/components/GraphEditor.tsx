'use client';

import { exportToDrawio, exportToSvg, importFromDrawio, importFromMermaid, layoutWithSubgroups } from '@anytime-markdown/graph-core';
import { clearImageCache, physics,ViewportAnimation } from '@anytime-markdown/graph-core/engine';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useMemo,useRef, useState } from 'react';

import { useThemeMode } from '../../providers';
import {
  alignBottom, alignCenterH, alignCenterV, alignLeft, alignRight, alignTop, distributeH, distributeV,
  fitToContent, pan as panViewport, screenToWorld, zoom as zoomViewport,
} from '@anytime-markdown/graph-core/engine';
import { useAutoSave } from '../hooks/useAutoSave';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import { useDataMapping } from '../hooks/useDataMapping';
import { useGraphState } from '../hooks/useGraphState';
import { useNodeFilter } from '../hooks/useNodeFilter';
import { usePathHighlight } from '../hooks/usePathHighlight';
import { useTouchInteraction } from '../hooks/useTouchInteraction';
import { getLastDocumentId,loadDocument } from '../store/graphStorage';
import { createDocument, createNode, type GraphDocument,ToolType, Viewport } from '../types';
import type { DataMappingConfig } from '../types/dataMapping';
import type { NodeFilterConfig } from '../types/nodeFilter';
import { EMPTY_FILTER } from '../types/nodeFilter';
import { DetailPanel } from './DetailPanel';
import { DocEditorModal } from './DocEditorModal';
import { FilterPanel } from './FilterPanel';
import { GraphCanvas } from './GraphCanvas';
import { PropertyPanel } from './PropertyPanel';
import { SettingsPanel } from './SettingsPanel';
import { ShapeHoverBar } from './ShapeHoverBar';
import { TextEditOverlay } from './TextEditOverlay';
import { GraphToolBar } from './ToolBar';

export function GraphEditor() {
  const { themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  const [tool, setTool] = useState<ToolType>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [textEditAppendMode, setTextEditAppendMode] = useState(false);
  const [showProperty, setShowProperty] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [collisionEnabled, setCollisionEnabled] = useState(false);
  const [layoutAlgorithm, setLayoutAlgorithm] = useState<'eades' | 'fruchterman-reingold' | 'eades-vpsc' | 'fruchterman-reingold-vpsc' | 'hierarchical'>('eades');
  const [dataMappingConfig, _setDataMappingConfig] = useState<DataMappingConfig | undefined>(undefined);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const [filterConfig, setFilterConfig] = useState<NodeFilterConfig>(EMPTY_FILTER);
  const [showFilter, setShowFilter] = useState(false);
  const physicsRef = useRef<physics.PhysicsEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { state, dispatch } = useGraphState();
  const nodesRef = useRef(state.document.nodes);
  const edgesRef = useRef(state.document.edges);
  nodesRef.current = state.document.nodes;
  edgesRef.current = state.document.edges;
  const selectionRef = useRef(state.selection);
  selectionRef.current = state.selection;
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
        for (const key of Object.keys(node.metadata)) {
          keys.add(key);
        }
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
  const [docEditNodeId, setDocEditNodeId] = useState<string | null>(null);
  const t = useTranslations('Graph');
  const [liveMessage, setLiveMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    const lastId = getLastDocumentId();
    if (lastId) {
      loadDocument(lastId).then(doc => {
        if (doc) dispatch({ type: 'SET_DOCUMENT', doc });
      });
    }
  }, [dispatch]);

  // ドキュメント切替時に画像キャッシュをクリア
  useEffect(() => {
    clearImageCache();
  }, [state.document.id]);

  const saveStatus = useAutoSave(state.document);

  const canvasAriaLabel = `${t('graphCanvas')}: ${state.document.nodes.length} nodes, ${state.document.edges.length} edges`;

  const prevNodeCountRef = useRef(state.document.nodes.length);

  useEffect(() => {
    const currentCount = state.document.nodes.length;
    const prevCount = prevNodeCountRef.current;
    if (currentCount > prevCount) {
      setLiveMessage(t('nodeAdded'));
    } else if (currentCount < prevCount) {
      setLiveMessage(t('nodeDeleted'));
    }
    prevNodeCountRef.current = currentCount;
  }, [state.document.nodes.length, t]);

  useEffect(() => {
    const { nodeIds, edgeIds } = state.selection;
    if (nodeIds.length > 0 || edgeIds.length > 0) {
      setLiveMessage(`${nodeIds.length} ${t('nodesSelected')}, ${edgeIds.length} ${t('edgesSelected')}`);
      setShowProperty(true);
    } else {
      setLiveMessage('');
    }
  }, [state.selection, t]);

  const handleAutoLayout = useCallback(() => {
    if (layoutRunning) return;
    setLayoutRunning(true);
    dispatch({ type: 'SNAPSHOT' });

    const engine = new physics.PhysicsEngine({ collisionEnabled: true, algorithm: layoutAlgorithm });
    engine.initLayout(nodesRef.current, edgesRef.current);
    physicsRef.current = engine;

    const loop = () => {
      const running = engine.tick();
      const positions = engine.getPositions();
      const updates: Array<{ id: string; x: number; y: number }> = [];
      for (const [id, pos] of positions) {
        updates.push({ id, x: pos.x, y: pos.y });
      }
      dispatch({ type: 'SET_NODE_POSITIONS', updates });

      if (running) {
        requestAnimationFrame(loop);
      } else {
        // Apply minimum gap between connected nodes after layout converges
        // Pass null to use engine's internal body positions (layout result)
        const spreadPositions = engine.spreadConnected(
          null, edgesRef.current, 100,
        );
        const spreadUpdates: Array<{ id: string; x: number; y: number }> = [];
        for (const [id, pos] of spreadPositions) {
          spreadUpdates.push({ id, x: pos.x, y: pos.y });
        }
        dispatch({ type: 'SET_NODE_POSITIONS', updates: spreadUpdates });
        setLayoutRunning(false);
        dispatch({ type: 'SNAPSHOT' });
      }
    };
    requestAnimationFrame(loop);
  }, [layoutRunning, layoutAlgorithm, dispatch]);

  const handleSpreadConnected = useCallback(() => {
    dispatch({ type: 'SNAPSHOT' });
    const engine = new physics.PhysicsEngine();
    const positions = engine.spreadConnected(nodesRef.current, edgesRef.current, 100);
    const updates: Array<{ id: string; x: number; y: number }> = [];
    for (const [id, pos] of positions) {
      updates.push({ id, x: pos.x, y: pos.y });
    }
    dispatch({ type: 'SET_NODE_POSITIONS', updates });
    dispatch({ type: 'SNAPSHOT' });
  }, [dispatch]);

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
      setTextEditAppendMode(false);
      setEditingNodeId(nodeId);
    }
  }, [state.document.nodes]);

  const {
    handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleDoubleClick, previewRef, dragRef,
    hoverNodeIdRef, mouseWorldRef, velocityRef,
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
    isDark,
    collisionEnabled,
    physicsRef,
    onLiveMessage: useCallback((key: string) => {
      if (key === 'undo') setLiveMessage(t('undone'));
      else if (key === 'redo') setLiveMessage(t('redone'));
    }, [t]),
  });

  useTouchInteraction({
    canvasRef,
    viewport: state.document.viewport,
    dispatch,
    velocityRef,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.getAttribute('contenteditable') === 'true') return;
      if (editingNodeId) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const ids = selectionRef.current.nodeIds;
        if (ids.length === 0) return;
        const step = e.shiftKey ? 10 : 1;
        const dxRight = e.key === 'ArrowRight' ? step : 0;
        const dxLeft = e.key === 'ArrowLeft' ? -step : 0;
        const dx = dxRight || dxLeft;
        const dyDown = e.key === 'ArrowDown' ? step : 0;
        const dyUp = e.key === 'ArrowUp' ? -step : 0;
        const dy = dyDown || dyUp;
        if (dx !== 0 || dy !== 0) {
          dispatch({ type: 'MOVE_NODES', ids, dx, dy });
          e.preventDefault();
        }
        return;
      }
      // 単一ノード選択中に印字可能キーを押したらテキスト編集開始（ショートカットより優先）
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
        l: 'line', c: 'connector',
      };
      if (map[e.key] && !e.ctrlKey && !e.metaKey) {
        setTool(map[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingNodeId, dispatch, state.document.nodes, handleTextEdit]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && state.selection.nodeIds.length === 1) {
        const selectedId = state.selection.nodeIds[0];
        setOriginNodeId(originNodeId === selectedId ? null : selectedId);
      }
    };
    globalThis.addEventListener('click', handler);
    return () => globalThis.removeEventListener('click', handler);
  }, [state.selection.nodeIds, setOriginNodeId, originNodeId]);

  const handleTextCommit = useCallback((id: string, text: string) => {
    dispatch({ type: 'UPDATE_NODE', id, changes: { text } });
    setEditingNodeId(null);
  }, [dispatch]);

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
    // Keep the center of the canvas fixed while changing scale
    const worldCenterX = (cx - vp.offsetX) / vp.scale;
    const worldCenterY = (cy - vp.offsetY) / vp.scale;
    const target: Viewport = {
      offsetX: cx - worldCenterX * newScale,
      offsetY: cy - worldCenterY * newScale,
      scale: newScale,
    };
    startViewportAnimation(target);
  }, [state.document.viewport, startViewportAnimation]);

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
      width: w,
      height: h,
      imageData: dataUrl,
    }, isDark);
    dispatch({ type: 'ADD_NODE', node });
  }, [state.document.viewport, dispatch, isDark]);

  const handleClearAll = useCallback(() => {
    setConfirmDialog({
      open: true,
      title: t('clearAll'),
      message: t('clearAllConfirm'),
      onConfirm: () => dispatch({ type: 'SET_DOCUMENT', doc: createDocument('Untitled') }),
    });
  }, [dispatch, t]);

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
            dispatch({ type: 'SET_DOCUMENT', doc });
          },
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }, [dispatch, t, setConfirmDialog]);

  const handleImportGraph = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.graph';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const json = reader.result as string;
        try {
          const doc = JSON.parse(json) as GraphDocument;
          if (!doc.nodes || !doc.edges) return;
          setConfirmDialog({
            open: true,
            title: t('import'),
            message: t('importConfirm'),
            onConfirm: () => {
              dispatch({ type: 'SET_DOCUMENT', doc });
            },
          });
        } catch {
          // invalid JSON
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [dispatch, t, setConfirmDialog]);

  const handleImportMermaid = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mmd';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        try {
          const { doc, direction } = importFromMermaid(text);
          if (!doc.nodes || !doc.edges) return;

          layoutWithSubgroups(doc, direction, 180, 60);

          setConfirmDialog({
            open: true,
            title: t('import'),
            message: t('importConfirm'),
            onConfirm: () => {
              dispatch({ type: 'SET_DOCUMENT', doc });
            },
          });
        } catch {
          // invalid mermaid
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [dispatch, t, setConfirmDialog]);

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
        onUndo={() => { dispatch({ type: 'UNDO' }); setLiveMessage(t('undone')); }}
        onRedo={() => { dispatch({ type: 'REDO' }); setLiveMessage(t('redone')); }}
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
        onImportGraph={handleImportGraph}
        onImportMermaid={handleImportMermaid}
        onAlign={handleAlign}
        onSetScale={handleSetScale}
        selectionCount={state.selection.nodeIds.length}
        hasSelection={state.selection.nodeIds.length > 0 || state.selection.edgeIds.length > 0}
        scale={state.document.viewport.scale}
        saveStatus={saveStatus}
        onToggleSettings={() => setShowSettings(v => !v)}
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
      <Box sx={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <GraphCanvas
          nodes={displayNodes}
          edges={displayEdges}
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
          ariaLabel={canvasAriaLabel}
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
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)',
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 300 }}>{t('emptyCanvasTitle')}</Typography>
            <Typography variant="body2">{t('emptyCanvasHint')}</Typography>
          </Box>
        )}
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
          appendMode={textEditAppendMode}
        />
        {showProperty && (selectedNode || selectedEdge) && (
          <PropertyPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onUpdateNode={(id, changes) => dispatch({ type: 'UPDATE_NODE', id, changes })}
            onUpdateEdge={(id, changes) => dispatch({ type: 'UPDATE_EDGE', id, changes })}
            onLayerAction={handleLayerAction}
            onClose={() => {
              setShowProperty(false);
              canvasRef.current?.focus();
            }}
          />
        )}
        {detailNodeId && !showProperty && (() => {
          const detailNode = state.document.nodes.find(n => n.id === detailNodeId);
          return detailNode ? (
            <DetailPanel
              node={detailNode}
              onClose={() => setDetailNodeId(null)}
            />
          ) : null;
        })()}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
          }}
        >
          {liveMessage}
        </div>
      </Box>
      {showFilter && (
        <FilterPanel
          config={filterConfig}
          onConfigChange={setFilterConfig}
          availableKeys={availableMetadataKeys}
          keyRanges={metadataKeyRanges}
          onClose={() => setShowFilter(false)}
        />
      )}
      <SettingsPanel open={showSettings} width={260} onClose={() => setShowSettings(false)} />
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
    </Box>
  );
}
