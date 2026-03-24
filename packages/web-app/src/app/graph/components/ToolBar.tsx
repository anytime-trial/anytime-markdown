'use client';

import React from 'react';
import {
  AppBar, Toolbar, ToggleButton, ToggleButtonGroup,
  IconButton, Tooltip, Divider, Box,
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
} from '@mui/icons-material';
import { ToolType } from '../types';

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
  hasSelection: boolean;
  scale: number;
}

export function GraphToolBar({
  tool, onToolChange, onUndo, onRedo, canUndo, canRedo,
  showGrid, onToggleGrid, onZoomIn, onZoomOut, onFitContent,
  onDelete, hasSelection, scale,
}: ToolBarProps) {
  return (
    <AppBar
      position="static"
      color="default"
      elevation={1}
      sx={{ backgroundColor: 'background.paper', zIndex: 10 }}
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
