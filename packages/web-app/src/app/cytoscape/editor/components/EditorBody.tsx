'use client';

import { useState, useCallback, useRef } from 'react';
import type { Core, ElementDefinition } from 'cytoscape';
import Box from '@mui/material/Box';
import { CytoscapeCanvas, type CytoscapeCanvasRef } from '../../components/CytoscapeCanvas';
import { defaultStylesheetJsonBlock } from '../../components/sampleData';
import { Toolbar } from './Toolbar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EditorMode = 'select' | 'addNode' | 'addEdge';

// ---------------------------------------------------------------------------
// Default elements
// ---------------------------------------------------------------------------

const DEFAULT_ELEMENTS: ElementDefinition[] = [
  { data: { id: 'n1', label: 'Node 1' }, position: { x: 200, y: 150 } },
  { data: { id: 'n2', label: 'Node 2' }, position: { x: 350, y: 150 } },
  { data: { id: 'n3', label: 'Node 3' }, position: { x: 275, y: 300 } },
  { data: { id: 'e1', source: 'n1', target: 'n2', label: 'Edge 1' } },
  { data: { id: 'e2', source: 'n2', target: 'n3', label: 'Edge 2' } },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nodeCounter = 4;

function generateNodeId(): string {
  const id = `n${nodeCounter}`;
  nodeCounter += 1;
  return id;
}

function snapshotElements(cy: Core): ElementDefinition[] {
  return cy.elements().jsons() as ElementDefinition[];
}

// ---------------------------------------------------------------------------
// EditorBody
// ---------------------------------------------------------------------------

export function EditorBody() {
  const canvasRef = useRef<CytoscapeCanvasRef>(null);
  const cyInstanceRef = useRef<Core | null>(null);

  const [mode, setMode] = useState<EditorMode>('select');
  const [elements] = useState<ElementDefinition[]>(DEFAULT_ELEMENTS);
  const [history, setHistory] = useState<ElementDefinition[][]>([]);
  const [future, setFuture] = useState<ElementDefinition[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edgeSource, setEdgeSource] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Push current state to undo history
  // -----------------------------------------------------------------------

  const pushHistory = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    const snapshot = snapshotElements(cy);
    setHistory(prev => [...prev, snapshot]);
    setFuture([]);
  }, []);

  // We need to update event handlers when mode/edgeSource changes.
  // Since CytoscapeCanvas only initializes once, we use refs for mutable state.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const edgeSourceRef = useRef(edgeSource);
  edgeSourceRef.current = edgeSource;

  const handleCyReadyStable = useCallback(
    (cy: Core) => {
      cyInstanceRef.current = cy;

      cy.on('tap', event => {
        if (event.target !== cy) return;
        if (modeRef.current !== 'addNode') return;

        pushHistory();
        const pos = event.position;
        const id = generateNodeId();
        cy.add({
          group: 'nodes',
          data: { id, label: id },
          position: { x: pos.x, y: pos.y },
        });
      });

      cy.on('tap', 'node', event => {
        const nodeId = event.target.id();

        if (modeRef.current === 'addEdge') {
          const source = edgeSourceRef.current;
          if (source === null) {
            setEdgeSource(nodeId);
          } else {
            if (source !== nodeId) {
              pushHistory();
              const edgeId = `e-${source}-${nodeId}`;
              cy.add({
                group: 'edges',
                data: { id: edgeId, source, target: nodeId },
              });
            }
            setEdgeSource(null);
          }
          return;
        }

        if (modeRef.current === 'select') {
          setSelectedId(nodeId);
        }
      });

      cy.on('tap', 'edge', event => {
        if (modeRef.current === 'select') {
          setSelectedId(event.target.id());
        }
      });

      cy.on('unselect', () => {
        setSelectedId(null);
      });
    },
    [pushHistory],
  );

  // -----------------------------------------------------------------------
  // Toolbar handlers
  // -----------------------------------------------------------------------

  const handleDelete = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy || selectedId === null) return;

    pushHistory();
    const el = cy.getElementById(selectedId);
    if (el.length > 0) {
      cy.remove(el);
    }
    setSelectedId(null);
  }, [selectedId, pushHistory]);

  const handleUndo = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy || history.length === 0) return;

    const currentSnapshot = snapshotElements(cy);
    const prev = history.at(-1);
    if (!prev) return;

    setFuture(f => [...f, currentSnapshot]);
    setHistory(h => h.slice(0, -1));

    cy.elements().remove();
    cy.add(prev);
  }, [history]);

  const handleRedo = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy || future.length === 0) return;

    const currentSnapshot = snapshotElements(cy);
    const next = future.at(-1);
    if (!next) return;

    setHistory(h => [...h, currentSnapshot]);
    setFuture(f => f.slice(0, -1));

    cy.elements().remove();
    cy.add(next);
  }, [future]);

  const handleLayout = useCallback((name: string) => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.layout({ name }).run();
  }, []);

  const handleImport = useCallback(() => {
    // Placeholder — Task 6 will add import dialog
    // eslint-disable-next-line no-console
    console.info('[Editor] Import placeholder');
  }, []);

  const handleExport = useCallback(() => {
    // Placeholder — Task 6 will add export dialog
    const cy = cyInstanceRef.current;
    if (!cy) return;
    const json = cy.json();
    // eslint-disable-next-line no-console
    console.info('[Editor] Export:', JSON.stringify((json as Record<string, unknown>).elements));
  }, []);

  const handleModeChange = useCallback((newMode: EditorMode) => {
    setMode(newMode);
    setEdgeSource(null);
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
      <Toolbar
        mode={mode}
        onModeChange={handleModeChange}
        onDelete={handleDelete}
        onLayout={handleLayout}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        onImport={handleImport}
        onExport={handleExport}
      />
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <CytoscapeCanvas
          ref={canvasRef}
          elements={elements}
          stylesheet={defaultStylesheetJsonBlock}
          layout={{ name: 'preset' }}
          onCyReady={handleCyReadyStable}
          sx={{ position: 'absolute', inset: 0 }}
        />
      </Box>
    </Box>
  );
}
