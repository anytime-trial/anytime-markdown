'use client';

import { buildElementTree, buildLevelView, c4ToGraphDocument, extractBoundaries, filterTreeByLevel, parseMermaidC4 } from '@anytime-markdown/c4-kernel';
import type { BoundaryInfo, C4Model } from '@anytime-markdown/c4-kernel';
import type { GraphDocument, GraphNode } from '@anytime-markdown/graph-core';
import { engine, layoutWithSubgroups, state as graphState } from '@anytime-markdown/graph-core';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import GridOnIcon from '@mui/icons-material/GridOn';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Toolbar from '@mui/material/Toolbar';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { C4ElementTree } from './C4ElementTree';
import { DsmCanvas } from './DsmCanvas';
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

/** デザインシステム: ミッドナイトネイビー背景 */
const BG_PRIMARY = '#0D1117';
/** デザインシステム: チャコール */
const BG_SECONDARY = '#121212';
/** デザインシステム: アイスブルー */
const ACCENT_BLUE = '#90CAF9';
/** デザインシステム: ボーダー */
const BORDER_COLOR = 'rgba(255,255,255,0.12)';

export function C4Viewer() {
  const [state, dispatch] = useReducer(graphReducer, createInitialState());
  const [fullDoc, setFullDoc] = useState<GraphDocument | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(4);
  const [c4Model, setC4Model] = useState<C4Model | null>(null);
  const [boundaryInfos, setBoundaryInfos] = useState<readonly BoundaryInfo[]>([]);
  const [showTree, setShowTree] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [dsmLevel, setDsmLevel] = useState<'component' | 'package'>('component');
  const [dsmClustered, setDsmClustered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadMermaidText = useCallback((text: string) => {
    try {
      const boundaries = extractBoundaries(text);
      const model = parseMermaidC4(text);
      setC4Model(model);
      setBoundaryInfos(boundaries);
      const doc = c4ToGraphDocument(model, boundaries);
      layoutWithSubgroups(doc, 'TB', 180, 60);
      setFullDoc(doc);
      setCurrentLevel(4);
      dispatch({ type: 'SET_DOCUMENT', doc });
    } catch {
      // invalid C4 mermaid
    }
  }, []);

  // 初期表示: public/anytime-markdown-c4.mmd を読み込む
  useEffect(() => {
    fetch('/anytime-markdown-c4.mmd')
      .then(res => { if (res.ok) return res.text(); })
      .then(text => { if (text) loadMermaidText(text); })
      .catch(() => { /* ファイルが存在しない場合は無視 */ });
  }, [loadMermaidText]);

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
        loadMermaidText(text);
      };
      reader.readAsText(file);
    };
    input.click();
  }, [loadMermaidText]);

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

  const elementTree = useMemo(() => {
    if (!c4Model) return [];
    const fullTree = buildElementTree(c4Model, boundaryInfos);
    return filterTreeByLevel(fullTree, currentLevel);
  }, [c4Model, boundaryInfos, currentLevel]);

  const toolbarButtonSx = {
    textTransform: 'none',
    color: ACCENT_BLUE,
    borderColor: BORDER_COLOR,
    fontWeight: 600,
    fontSize: '0.875rem',
    borderRadius: '8px',
    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
  } as const;

  const levelButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.75rem',
    minWidth: 36,
    borderColor: BORDER_COLOR,
    color: 'rgba(255,255,255,0.70)',
    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
  } as const;

  const levelButtonActiveSx = {
    ...levelButtonSx,
    bgcolor: `${ACCENT_BLUE} !important`,
    color: `${BG_PRIMARY} !important`,
    borderColor: `${ACCENT_BLUE} !important`,
  } as const;

  const c4Toolbar = (
    <Toolbar
      variant="dense"
      sx={{
        gap: 1,
        bgcolor: BG_SECONDARY,
        borderBottom: `1px solid ${BORDER_COLOR}`,
        minHeight: 44,
        px: { xs: 2, md: 3 },
      }}
    >
      <Button
        size="small"
        startIcon={<UploadFileIcon sx={{ fontSize: 18 }} />}
        onClick={handleImportMermaid}
        sx={toolbarButtonSx}
      >
        Import
      </Button>
      <ButtonGroup size="small" sx={{ ml: 1 }}>
        {[1, 2, 3, 4].map(level => (
          <Button
            key={level}
            onClick={() => handleSetLevel(level)}
            sx={currentLevel === level ? levelButtonActiveSx : levelButtonSx}
          >
            L{level}
          </Button>
        ))}
      </ButtonGroup>
      <Button
        size="small"
        startIcon={<FitScreenIcon sx={{ fontSize: 18 }} />}
        onClick={handleFit}
        sx={toolbarButtonSx}
      >
        Fit
      </Button>
      <Box sx={{ flex: 1 }} />
      <Button
        size="small"
        startIcon={<AccountTreeIcon sx={{ fontSize: 18 }} />}
        onClick={() => setShowTree(prev => !prev)}
        sx={{
          ...toolbarButtonSx,
          ...(showTree && { bgcolor: 'rgba(144,202,249,0.12)' }),
        }}
      >
        Tree
      </Button>
    </Toolbar>
  );

  const dsmToolbar = (
    <Toolbar
      variant="dense"
      sx={{
        gap: 1,
        bgcolor: BG_SECONDARY,
        borderBottom: `1px solid ${BORDER_COLOR}`,
        minHeight: 44,
        px: { xs: 2, md: 3 },
      }}
    >
      <ButtonGroup size="small">
        {(['component', 'package'] as const).map(lv => (
          <Button
            key={lv}
            onClick={() => setDsmLevel(lv)}
            sx={dsmLevel === lv ? levelButtonActiveSx : levelButtonSx}
          >
            {lv === 'component' ? 'Component' : 'Package'}
          </Button>
        ))}
      </ButtonGroup>
      <Button
        size="small"
        onClick={() => setDsmClustered(prev => !prev)}
        sx={{
          ...toolbarButtonSx,
          ml: 1,
          ...(dsmClustered && { bgcolor: 'rgba(144,202,249,0.12)' }),
        }}
      >
        Cluster
      </Button>
    </Toolbar>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', bgcolor: BG_PRIMARY }}>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          bgcolor: BG_SECONDARY,
          borderBottom: `1px solid ${BORDER_COLOR}`,
          minHeight: 36,
          '& .MuiTab-root': {
            color: 'rgba(255,255,255,0.5)',
            minHeight: 36,
            textTransform: 'none',
            fontSize: '0.8125rem',
            fontWeight: 600,
          },
          '& .Mui-selected': { color: `${ACCENT_BLUE} !important` },
          '& .MuiTabs-indicator': { backgroundColor: ACCENT_BLUE },
        }}
      >
        <Tab label="C4 Model" />
        <Tab icon={<GridOnIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="DSM" />
      </Tabs>
      {activeTab === 0 && c4Toolbar}
      {activeTab === 1 && dsmToolbar}
      <Box sx={{ flex: 1, position: 'relative', bgcolor: BG_PRIMARY }}>
        {activeTab === 0 && (
          <>
            <GraphCanvas
              document={state.document}
              viewport={state.document.viewport}
              dispatch={dispatch}
              canvasRef={canvasRef}
            />
            {showTree && elementTree.length > 0 && (
              <C4ElementTree
                tree={elementTree}
                dispatch={dispatch}
                onClose={() => setShowTree(false)}
              />
            )}
          </>
        )}
        {activeTab === 1 && c4Model && (
          <DsmCanvas
            model={c4Model}
            boundaries={boundaryInfos}
            level={dsmLevel}
            clustered={dsmClustered}
          />
        )}
      </Box>
    </Box>
  );
}
