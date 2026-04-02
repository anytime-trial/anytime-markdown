'use client';

import { useState, useCallback, useRef } from 'react';
import type { Core, ElementDefinition } from 'cytoscape';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { CytoscapeCanvas, type CytoscapeCanvasRef } from '../../components/CytoscapeCanvas';
import { defaultStylesheetJsonBlock } from '../../components/sampleData';
import { Toolbar } from './Toolbar';
import { PropertyPanel } from './PropertyPanel';

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
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportText, setExportText] = useState('');

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
    setImportText('');
    setShowImportDialog(true);
  }, []);

  const handleImportApply = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    try {
      const parsed = JSON.parse(importText) as ElementDefinition[];
      pushHistory();
      cy.elements().remove();
      cy.add(parsed);
      setShowImportDialog(false);
    } catch {
      // Invalid JSON — keep dialog open
    }
  }, [importText, pushHistory]);

  const handleExport = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    const json = cy.json() as Record<string, unknown>;
    setExportText(JSON.stringify(json.elements, null, 2));
    setShowExportDialog(true);
  }, []);

  const handleExportCopy = useCallback(() => {
    void navigator.clipboard.writeText(exportText);
  }, [exportText]);

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
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Box sx={{ flex: 1, position: 'relative' }}>
          <CytoscapeCanvas
            ref={canvasRef}
            elements={elements}
            stylesheet={defaultStylesheetJsonBlock}
            layout={{ name: 'preset' }}
            onCyReady={handleCyReadyStable}
            sx={{ position: 'absolute', inset: 0 }}
          />
        </Box>
        <PropertyPanel selectedId={selectedId} cy={cyInstanceRef.current} />
      </Box>

      {/* Import Dialog */}
      <Dialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Import Elements</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            fullWidth
            minRows={8}
            maxRows={16}
            placeholder="Paste JSON elements array here..."
            value={importText}
            onChange={e => setImportText(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowImportDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleImportApply}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      {/* Export Dialog */}
      <Dialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Export Elements</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            fullWidth
            minRows={8}
            maxRows={16}
            value={exportText}
            slotProps={{
              input: {
                readOnly: true,
                sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
              },
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowExportDialog(false)}>Close</Button>
          <Button variant="contained" onClick={handleExportCopy}>
            Copy
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
