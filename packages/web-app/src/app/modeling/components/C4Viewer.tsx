'use client';

import { useReducer, useRef, useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import { parseMermaidC4, extractBoundaries, c4ToGraphDocument, buildLevelView } from '@anytime-markdown/c4-kernel';
import { engine, state as graphState, layoutWithSubgroups } from '@anytime-markdown/graph-core';
import type { GraphDocument, GraphNode } from '@anytime-markdown/graph-core';
import { GraphCanvas } from './GraphCanvas';

const { graphReducer, createInitialState } = graphState;
const { fitToContent } = engine;

/** ノード群のバウンディングボックスを計算 */
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

export function C4Viewer() {
  const [state, dispatch] = useReducer(graphReducer, createInitialState());
  const [fullDoc, setFullDoc] = useState<GraphDocument | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(4);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleImportMermaid = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mmd,.mermaid,.txt';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        try {
          const boundaries = extractBoundaries(text);
          const model = parseMermaidC4(text);
          const doc = c4ToGraphDocument(model, boundaries);
          layoutWithSubgroups(doc, 'TB', 180, 60);
          setFullDoc(doc);
          setCurrentLevel(4);
          dispatch({ type: 'SET_DOCUMENT', doc });
        } catch {
          // invalid C4 mermaid
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const handleSetLevel = useCallback((level: number) => {
    if (!fullDoc) return;
    setCurrentLevel(level);
    const view = buildLevelView(fullDoc, level);
    layoutWithSubgroups(view, 'TB', 180, 60);
    dispatch({ type: 'SET_DOCUMENT', doc: view });
  }, [fullDoc]);

  const handleFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = computeBounds(state.document.nodes);
    const viewport = fitToContent(canvas.clientWidth, canvas.clientHeight, bounds);
    dispatch({ type: 'SET_VIEWPORT', viewport });
  }, [state.document.nodes]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar variant="dense" sx={{ gap: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ mr: 2 }}>C4 Model</Typography>
        <Button
          size="small"
          startIcon={<UploadFileIcon />}
          onClick={handleImportMermaid}
        >
          Import Mermaid C4
        </Button>
        <ButtonGroup size="small" sx={{ ml: 2 }}>
          {[1, 2, 3, 4].map(level => (
            <Button
              key={level}
              variant={currentLevel === level ? 'contained' : 'outlined'}
              onClick={() => handleSetLevel(level)}
            >
              L{level}
            </Button>
          ))}
        </ButtonGroup>
        <Button size="small" startIcon={<FitScreenIcon />} onClick={handleFit}>
          Fit
        </Button>
      </Toolbar>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <GraphCanvas
          document={state.document}
          viewport={state.document.viewport}
          dispatch={dispatch}
          canvasRef={canvasRef}
        />
      </Box>
    </Box>
  );
}
