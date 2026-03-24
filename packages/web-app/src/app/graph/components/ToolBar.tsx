'use client';

import React from 'react';
import {
  AppBar, Toolbar, ToggleButton, ToggleButtonGroup,
  IconButton, Tooltip, Divider, Box, Menu, MenuItem,
  ListItemIcon, ListItemText,
} from '@mui/material';
import {
  NearMe as SelectIcon,
  CropSquare as RectIcon,
  CircleOutlined as EllipseIcon,
  StickyNote2Outlined as StickyIcon,
  TextFields as TextIcon,
  Remove as LineIcon,
  ArrowRightAlt as ArrowIcon,
  Timeline as ConnectorIcon,
  PanTool as PanIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  GridOn as GridIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FitScreen as FitIcon,
  Delete as DeleteIcon,
  LayersClear as ClearAllIcon,
  AlignHorizontalLeft as AlignHorizontalLeftIcon,
  AlignHorizontalRight as AlignHorizontalRightIcon,
  AlignVerticalTop as AlignVerticalTopIcon,
  AlignVerticalBottom as AlignVerticalBottomIcon,
  AlignHorizontalCenter as AlignHorizontalCenterIcon,
  AlignVerticalCenter as AlignVerticalCenterIcon,
  ViewColumn as ViewColumnIcon,
  TableRows as TableRowsIcon,
  Diamond as DiamondIcon,
  Hexagon as ParallelogramIcon,
  Storage as CylinderIcon,
  Lightbulb as InsightIcon,
  Description as DocIcon,
} from '@mui/icons-material';
import { ToolType } from '../types';
import { COLOR_CHARCOAL, COLOR_BORDER } from '@anytime-markdown/graph-core';

interface ToolBarProps {
  tool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  showGrid: boolean;
  onToggleGrid: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitContent: () => void;
  onDelete: () => void;
  onClearAll: () => void;
  onAlign: (type: string) => void;
  selectionCount: number;
  hasSelection: boolean;
  scale: number;
}

export function GraphToolBar({
  tool, onToolChange, onUndo, onRedo, canUndo, canRedo,
  showGrid, onToggleGrid, onZoomIn, onZoomOut, onFitContent,
  onDelete, onClearAll, onAlign, selectionCount, hasSelection, scale,
}: ToolBarProps) {
  const [alignAnchor, setAlignAnchor] = React.useState<null | HTMLElement>(null);
  return (
    <AppBar
      position="static"
      color="default"
      elevation={1}
      sx={{
        backgroundColor: COLOR_CHARCOAL,
        borderBottom: `1px solid ${COLOR_BORDER}`,
        backdropFilter: 'blur(12px)',
        zIndex: 10,
      }}
    >
      <Toolbar variant="dense" sx={{ gap: 1, minHeight: 48 }}>
        <ToggleButtonGroup
          value={tool}
          exclusive
          onChange={(_, val) => val && onToolChange(val)}
          size="small"
        >
          <ToggleButton value="select" aria-label="Select">
            <Tooltip title="Select (V)"><SelectIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="rect" aria-label="Rectangle">
            <Tooltip title="Rectangle (R)"><RectIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="ellipse" aria-label="Ellipse">
            <Tooltip title="Ellipse (O)"><EllipseIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="sticky" aria-label="Sticky Note">
            <Tooltip title="Sticky Note (S)"><StickyIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="text" aria-label="Text">
            <Tooltip title="Text (T)"><TextIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="diamond" aria-label="Diamond">
            <Tooltip title="Diamond (D)"><DiamondIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="parallelogram" aria-label="Parallelogram">
            <Tooltip title="Parallelogram (P)"><ParallelogramIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="cylinder" aria-label="Cylinder">
            <Tooltip title="Cylinder (Y)"><CylinderIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="insight" aria-label="Insight">
            <Tooltip title="Insight (I)"><InsightIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="doc" aria-label="Document">
            <Tooltip title="Document (M)"><DocIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="line" aria-label="Line">
            <Tooltip title="Line (L)"><LineIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="arrow" aria-label="Arrow">
            <Tooltip title="Arrow (A)"><ArrowIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="connector" aria-label="Connector">
            <Tooltip title="Connector (C)"><ConnectorIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="pan" aria-label="Pan">
            <Tooltip title="Pan (Space)"><PanIcon fontSize="small" /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        <Tooltip title="Undo (Ctrl+Z)">
          <span><IconButton size="small" onClick={onUndo} disabled={!canUndo}><UndoIcon fontSize="small" /></IconButton></span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Y)">
          <span><IconButton size="small" onClick={onRedo} disabled={!canRedo}><RedoIcon fontSize="small" /></IconButton></span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title="Delete (Del)">
          <span><IconButton size="small" onClick={onDelete} disabled={!hasSelection}><DeleteIcon fontSize="small" /></IconButton></span>
        </Tooltip>
        <Tooltip title="Clear All">
          <IconButton size="small" onClick={onClearAll}><ClearAllIcon fontSize="small" /></IconButton>
        </Tooltip>

        <Tooltip title="Alignment">
          <span>
            <IconButton size="small" onClick={e => setAlignAnchor(e.currentTarget)} disabled={selectionCount < 2}>
              <AlignHorizontalLeftIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Menu anchorEl={alignAnchor} open={Boolean(alignAnchor)} onClose={() => setAlignAnchor(null)}>
          <MenuItem onClick={() => { onAlign('left'); setAlignAnchor(null); }}><ListItemIcon><AlignHorizontalLeftIcon fontSize="small" /></ListItemIcon><ListItemText>Align Left</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('right'); setAlignAnchor(null); }}><ListItemIcon><AlignHorizontalRightIcon fontSize="small" /></ListItemIcon><ListItemText>Align Right</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('top'); setAlignAnchor(null); }}><ListItemIcon><AlignVerticalTopIcon fontSize="small" /></ListItemIcon><ListItemText>Align Top</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('bottom'); setAlignAnchor(null); }}><ListItemIcon><AlignVerticalBottomIcon fontSize="small" /></ListItemIcon><ListItemText>Align Bottom</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('centerH'); setAlignAnchor(null); }}><ListItemIcon><AlignHorizontalCenterIcon fontSize="small" /></ListItemIcon><ListItemText>Center Horizontally</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('centerV'); setAlignAnchor(null); }}><ListItemIcon><AlignVerticalCenterIcon fontSize="small" /></ListItemIcon><ListItemText>Center Vertically</ListItemText></MenuItem>
          <Divider />
          <MenuItem onClick={() => { onAlign('distributeH'); setAlignAnchor(null); }} disabled={selectionCount < 3}><ListItemIcon><ViewColumnIcon fontSize="small" /></ListItemIcon><ListItemText>Distribute Horizontally</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('distributeV'); setAlignAnchor(null); }} disabled={selectionCount < 3}><ListItemIcon><TableRowsIcon fontSize="small" /></ListItemIcon><ListItemText>Distribute Vertically</ListItemText></MenuItem>
        </Menu>

        <Box sx={{ flex: 1 }} />

        <Tooltip title="Zoom Out">
          <IconButton size="small" onClick={onZoomOut}><ZoomOutIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Box sx={{ minWidth: 48, textAlign: 'center', fontSize: '0.75rem', color: 'text.secondary' }}>
          {Math.round(scale * 100)}%
        </Box>
        <Tooltip title="Zoom In">
          <IconButton size="small" onClick={onZoomIn}><ZoomInIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Fit Content">
          <IconButton size="small" onClick={onFitContent}><FitIcon fontSize="small" /></IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title="Toggle Grid">
          <IconButton size="small" onClick={onToggleGrid} color={showGrid ? 'primary' : 'default'}>
            <GridIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
