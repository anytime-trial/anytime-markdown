'use client';

import { useReducer, useRef, useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import { parseMermaidC4, c4ToGraphDocument } from '@anytime-markdown/c4-kernel';
import type { BoundaryInfo } from '@anytime-markdown/c4-kernel';
import { engine, state as graphState, layoutWithSubgroups } from '@anytime-markdown/graph-core';
import type { GraphNode } from '@anytime-markdown/graph-core';
import { GraphCanvas } from './GraphCanvas';

const { graphReducer, createInitialState } = graphState;
const { fitToContent } = engine;

/** パーサー結果から境界情報を抽出する */
function extractBoundaries(input: string): BoundaryInfo[] {
  const boundaries: BoundaryInfo[] = [];
  const lines = input.split('\n').map(l => l.trim());
  for (const line of lines) {
    const match = /^(\w+_?Boundary)\s*\(\s*([^,]+),\s*"([^"]+)"\s*\)/.exec(line);
    if (match) {
      boundaries.push({ id: match[2].trim(), name: match[3] });
    }
  }
  return boundaries;
}

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
    setCurrentLevel(level);
    const { nodes } = state.document;
    const frames = nodes.filter(n => n.type === 'frame');
    for (const frame of frames) {
      let depth = 1;
      let parentId = frame.groupId;
      while (parentId) {
        depth++;
        const parent = nodes.find(n => n.id === parentId);
        parentId = parent?.groupId;
      }
      const shouldCollapse = depth >= level;
      if ((frame.collapsed ?? false) !== shouldCollapse) {
        dispatch({ type: 'UPDATE_NODE', id: frame.id, changes: { collapsed: shouldCollapse } });
      }
    }
  }, [state.document]);

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
