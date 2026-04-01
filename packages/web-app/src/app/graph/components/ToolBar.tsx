'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  AppBar, Toolbar, ToggleButton, ToggleButtonGroup,
  IconButton, Tooltip, Divider, Box, Menu, MenuItem,
  ListItemIcon, ListItemText, Popover, Typography,
  CircularProgress,
} from '@mui/material';
import {
  ArrowDropDown as ArrowDropDownIcon,
  NearMe as SelectIcon,
  CropSquare as RectIcon,
  // StickyNote2Outlined replaced by custom StickyNoteShapeIcon
  TextFields as TextIcon,
  Remove as LineIcon,
  PanTool as PanIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  GridOn as GridIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FitScreen as FitIcon,
  LayersClear as ClearAllIcon,
  FileDownload as ExportIcon,
  FileUpload as ImportIcon,
  AlignHorizontalLeft as AlignHorizontalLeftIcon,
  AlignHorizontalRight as AlignHorizontalRightIcon,
  AlignVerticalTop as AlignVerticalTopIcon,
  AlignVerticalBottom as AlignVerticalBottomIcon,
  AlignHorizontalCenter as AlignHorizontalCenterIcon,
  AlignVerticalCenter as AlignVerticalCenterIcon,
  ViewColumn as ViewColumnIcon,
  TableRows as TableRowsIcon,
  Description as DocIcon,
  Dashboard as FrameIcon,
  CloudDone as CloudDoneIcon,
  CloudSync as CloudSyncIcon,
  CloudOff as CloudOffIcon,
  CircleOutlined as EllipseIcon,
  // DiamondOutlined replaced by custom SVG diamond icon below
  // ParallelogramIcon, CylinderIcon replaced by custom SVG icons below
  AccountTree as AccountTreeIcon,
  Layers as LayersIcon,
  UnfoldMore as SpreadIcon,
  FilterList as FilterListIcon,
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { ToolType } from '../types';
import { SaveStatus } from '../hooks/useAutoSave';
import { getCanvasColors } from '@anytime-markdown/graph-core';
import { useThemeMode } from '../../providers';
import {
  DiamondShapeIcon as DiamondIcon,
  ParallelogramShapeIcon as ParallelogramIcon,
  CylinderShapeIcon as CylinderIcon,
  StickyNoteShapeIcon as StickyIcon,
} from './ShapeIcons';

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
  onClearAll: () => void;
  onExportSvg: () => void;
  onExportDrawio: () => void;
  onImportDrawio: () => void;
  onAlign: (type: string) => void;
  onSetScale: (scale: number) => void;
  selectionCount: number;
  hasSelection: boolean;
  scale: number;
  saveStatus: SaveStatus;
  onToggleSettings?: () => void;
  layoutRunning?: boolean;
  collisionEnabled?: boolean;
  onAutoLayout?: () => void;
  onToggleCollision?: (enabled: boolean) => void;
  layoutAlgorithm?: 'eades' | 'fruchterman-reingold' | 'eades-vpsc' | 'fruchterman-reingold-vpsc';
  onChangeAlgorithm?: (algorithm: 'eades' | 'fruchterman-reingold' | 'eades-vpsc' | 'fruchterman-reingold-vpsc') => void;
  onSpreadConnected?: () => void;
  showFilter?: boolean;
  onToggleFilter?: () => void;
  filterActive?: boolean;
}

export function GraphToolBar({
  tool, onToolChange, onUndo, onRedo, canUndo, canRedo,
  showGrid, onToggleGrid, onZoomIn, onZoomOut, onFitContent,
  onClearAll, onExportSvg, onExportDrawio, onImportDrawio, onAlign, onSetScale, selectionCount, hasSelection: _hasSelection, scale, saveStatus, onToggleSettings: _onToggleSettings,
  layoutRunning, collisionEnabled, onAutoLayout, onToggleCollision,
  layoutAlgorithm = 'eades', onChangeAlgorithm,
  onSpreadConnected,
  showFilter: _showFilter, onToggleFilter, filterActive,
}: Readonly<ToolBarProps>) {
  const t = useTranslations('Graph');
  const { themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);
  const [alignAnchor, setAlignAnchor] = React.useState<null | HTMLElement>(null);
  const [exportAnchor, setExportAnchor] = React.useState<null | HTMLElement>(null);
  const [zoomAnchor, setZoomAnchor] = useState<null | HTMLElement>(null);

  const saveStatusLabel = saveStatus === 'saving' ? t('saving') : t('saveError');
  const saveTooltip = saveStatus === 'saved' ? t('saved') : saveStatusLabel;

  // Shape group: long press to show dropdown, click to activate last shape
  const SHAPE_TOOLS = ['rect', 'ellipse', 'diamond', 'parallelogram', 'cylinder'] as const;
  type ShapeToolType = typeof SHAPE_TOOLS[number];
  const [lastShape, setLastShape] = useState<ShapeToolType>('rect');
  const [shapeAnchor, setShapeAnchor] = useState<null | HTMLElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const LONG_PRESS_DURATION = 400;

  const isShapeTool = (t: ToolType): t is ShapeToolType => SHAPE_TOOLS.includes(t as ShapeToolType);
  const isShapeSelected = isShapeTool(tool);

  // Update lastShape when a shape tool is selected (including via keyboard shortcut)
  React.useEffect(() => {
    if (isShapeTool(tool)) {
      setLastShape(tool as ShapeToolType);
    }
  }, [tool]);

  const shapeIconMap: Record<ShapeToolType, React.ReactElement> = {
    rect: <RectIcon fontSize="small" />,
    ellipse: <EllipseIcon fontSize="small" />,
    diamond: <DiamondIcon fontSize="small" />,
    parallelogram: <ParallelogramIcon fontSize="small" />,
    cylinder: <CylinderIcon fontSize="small" />,
  };

  const handleShapeMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const target = e.currentTarget;
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setShapeAnchor(target);
    }, LONG_PRESS_DURATION);
  }, []);

  const handleShapeMouseUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!isLongPress.current) {
      onToolChange(lastShape);
    }
  }, [lastShape, onToolChange]);

  const handleShapeMouseLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleShapeSelect = useCallback((shape: ShapeToolType) => {
    setLastShape(shape);
    onToolChange(shape);
    setShapeAnchor(null);
  }, [onToolChange]);
  return (
    <AppBar
      position="static"
      color="default"
      elevation={1}
      sx={{
        backgroundColor: colors.panelBg,
        borderBottom: `1px solid ${colors.panelBorder}`,
        backdropFilter: 'blur(12px)',
        zIndex: 10,
      }}
    >
      <Toolbar variant="dense" sx={{ gap: 1, minHeight: 48, '& .MuiIconButton-root': { color: colors.textSecondary }, '& .MuiDivider-root': { borderColor: colors.panelBorder } }}>
        <ToggleButtonGroup
          value={isShapeSelected ? lastShape : tool}
          exclusive
          onChange={(_, val) => {
            if (!val) return;
            // Shape button handles its own click/long-press logic
            if (isShapeTool(val as ToolType)) return;
            onToolChange(val);
          }}
          size="small"
          sx={{ '& .MuiToggleButton-root': { color: colors.textSecondary, '&.Mui-selected': { color: colors.accentColor, backgroundColor: `${colors.accentColor}1F` } } }}
        >
          <ToggleButton value="select" aria-label={t('select')}>
            <Tooltip title={`${t('select')} (V)`}><SelectIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="pan" aria-label={t('pan')}>
            <Tooltip title={`${t('pan')} (Space)`}><PanIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton
            value={lastShape}
            selected={isShapeSelected}
            aria-label={t(lastShape)}
            onMouseDown={handleShapeMouseDown}
            onMouseUp={handleShapeMouseUp}
            onMouseLeave={handleShapeMouseLeave}
            sx={{ position: 'relative', pr: 2.5 }}
          >
            <Tooltip title={`${t(lastShape)} (${t('longPressForMore')})`}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {shapeIconMap[lastShape]}
                <ArrowDropDownIcon sx={{ fontSize: 14, position: 'absolute', right: 2, bottom: 2, opacity: 0.6 }} />
              </Box>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="line" aria-label={t('line')}>
            <Tooltip title={`${t('line')} (L)`}><LineIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="sticky" aria-label={t('sticky')}>
            <Tooltip title={`${t('sticky')} (S)`}><StickyIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="text" aria-label={t('text')}>
            <Tooltip title={`${t('text')} (T)`}><TextIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="doc" aria-label={t('doc')}>
            <Tooltip title={`${t('doc')} (M)`}><DocIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="frame" aria-label={t('frame')}>
            <Tooltip title={`${t('frame')} (F)`}><FrameIcon fontSize="small" /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Popover
          open={Boolean(shapeAnchor)}
          anchorEl={shapeAnchor}
          onClose={() => setShapeAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: {
            sx: {
              backgroundColor: colors.panelBg,
              border: `1px solid ${colors.panelBorder}`,
              backdropFilter: 'blur(12px)',
              display: 'flex',
              flexDirection: 'column',
              p: 0.5,
              gap: 0.25,
            },
          } }}
        >
          {SHAPE_TOOLS.map((shape) => (
            <IconButton
              key={shape}
              size="small"
              onClick={() => handleShapeSelect(shape)}
              sx={{
                color: tool === shape ? colors.accentColor : colors.textSecondary,
                backgroundColor: tool === shape ? `${colors.accentColor}1F` : 'transparent',
                '&:hover': { backgroundColor: colors.hoverBg },
                borderRadius: 1,
              }}
            >
              <Tooltip title={t(shape)} placement="right">
                {shapeIconMap[shape]}
              </Tooltip>
            </IconButton>
          ))}
        </Popover>

        <Divider orientation="vertical" flexItem />

        <Tooltip title={`${t('undo')} (Ctrl+Z)`}>
          <span><IconButton size="small" onClick={onUndo} disabled={!canUndo}><UndoIcon fontSize="small" /></IconButton></span>
        </Tooltip>
        <Tooltip title={`${t('redo')} (Ctrl+Y)`}>
          <span><IconButton size="small" onClick={onRedo} disabled={!canRedo}><RedoIcon fontSize="small" /></IconButton></span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title={t('clearAll')}>
          <IconButton size="small" onClick={onClearAll}><ClearAllIcon fontSize="small" /></IconButton>
        </Tooltip>

        <Tooltip title={t('alignment')}>
          <span>
            <IconButton size="small" onClick={e => setAlignAnchor(e.currentTarget)} disabled={selectionCount < 2}>
              <AlignHorizontalLeftIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Menu anchorEl={alignAnchor} open={Boolean(alignAnchor)} onClose={() => setAlignAnchor(null)}>
          <MenuItem onClick={() => { onAlign('left'); setAlignAnchor(null); }}><ListItemIcon><AlignHorizontalLeftIcon fontSize="small" /></ListItemIcon><ListItemText>{t('alignLeft')}</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('right'); setAlignAnchor(null); }}><ListItemIcon><AlignHorizontalRightIcon fontSize="small" /></ListItemIcon><ListItemText>{t('alignRight')}</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('top'); setAlignAnchor(null); }}><ListItemIcon><AlignVerticalTopIcon fontSize="small" /></ListItemIcon><ListItemText>{t('alignTop')}</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('bottom'); setAlignAnchor(null); }}><ListItemIcon><AlignVerticalBottomIcon fontSize="small" /></ListItemIcon><ListItemText>{t('alignBottom')}</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('centerH'); setAlignAnchor(null); }}><ListItemIcon><AlignHorizontalCenterIcon fontSize="small" /></ListItemIcon><ListItemText>{t('alignCenterH')}</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('centerV'); setAlignAnchor(null); }}><ListItemIcon><AlignVerticalCenterIcon fontSize="small" /></ListItemIcon><ListItemText>{t('alignCenterV')}</ListItemText></MenuItem>
          <Divider />
          <MenuItem onClick={() => { onAlign('distributeH'); setAlignAnchor(null); }} disabled={selectionCount < 3}><ListItemIcon><ViewColumnIcon fontSize="small" /></ListItemIcon><ListItemText>{t('distributeH')}</ListItemText></MenuItem>
          <MenuItem onClick={() => { onAlign('distributeV'); setAlignAnchor(null); }} disabled={selectionCount < 3}><ListItemIcon><TableRowsIcon fontSize="small" /></ListItemIcon><ListItemText>{t('distributeV')}</ListItemText></MenuItem>
        </Menu>

        <Tooltip title={`${t('autoLayout')} (${
          { 'eades': 'Eades', 'fruchterman-reingold': 'FR', 'eades-vpsc': 'Eades+VPSC', 'fruchterman-reingold-vpsc': 'FR+VPSC' }[layoutAlgorithm]
        })`}>
          <span>
            <IconButton
              onClick={onAutoLayout}
              disabled={layoutRunning}
              size="small"
            >
              {layoutRunning ? <CircularProgress size={18} /> : <AccountTreeIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('switchAlgorithm')}>
          <IconButton
            onClick={() => {
              const cycle: Array<'eades' | 'fruchterman-reingold' | 'eades-vpsc' | 'fruchterman-reingold-vpsc'> = ['eades', 'fruchterman-reingold', 'eades-vpsc', 'fruchterman-reingold-vpsc'];
              const idx = cycle.indexOf(layoutAlgorithm);
              onChangeAlgorithm?.(cycle[(idx + 1) % cycle.length]);
            }}
            size="small"
            disabled={layoutRunning}
          >
            <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 'bold', lineHeight: 1 }}>
              {{ 'eades': 'EA', 'fruchterman-reingold': 'FR', 'eades-vpsc': 'EA+V', 'fruchterman-reingold-vpsc': 'FR+V' }[layoutAlgorithm]}
            </Typography>
          </IconButton>
        </Tooltip>
        <Tooltip title={t('collisionDetection')}>
          <IconButton
            onClick={() => onToggleCollision?.(!collisionEnabled)}
            size="small"
            sx={{
              color: collisionEnabled ? '#90caf9' : 'inherit',
              backgroundColor: collisionEnabled ? 'rgba(144,202,249,0.16)' : 'transparent',
              borderRadius: 1,
            }}
          >
            <LayersIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('spreadConnected')}>
          <IconButton
            onClick={onSpreadConnected}
            size="small"
          >
            <SpreadIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        <Tooltip title={t('zoomOut')}>
          <IconButton size="small" onClick={onZoomOut}><ZoomOutIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Box
          onClick={(e) => setZoomAnchor(e.currentTarget)}
          sx={{ minWidth: 48, textAlign: 'center', fontSize: '0.75rem', color: 'text.secondary', cursor: 'pointer', '&:hover': { bgcolor: colors.hoverBg }, borderRadius: 1, px: 0.5 }}
        >
          {Math.round(scale * 100)}%
        </Box>
        <Menu anchorEl={zoomAnchor} open={Boolean(zoomAnchor)} onClose={() => setZoomAnchor(null)}>
          {[50, 75, 100, 150, 200].map(pct => (
            <MenuItem key={pct} onClick={() => { onSetScale(pct / 100); setZoomAnchor(null); }}>
              {pct}%
            </MenuItem>
          ))}
        </Menu>
        <Tooltip title={t('zoomIn')}>
          <IconButton size="small" onClick={onZoomIn}><ZoomInIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title={t('fitContent')}>
          <IconButton size="small" onClick={onFitContent}><FitIcon fontSize="small" /></IconButton>
        </Tooltip>

        <Tooltip title={saveTooltip}>
          <Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5 }}>
            {saveStatus === 'saved' && <CloudDoneIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
            {saveStatus === 'saving' && <CloudSyncIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
            {saveStatus === 'error' && <CloudOffIcon fontSize="small" sx={{ color: '#f44336' }} />}
          </Box>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title={t('grid')}>
          <IconButton size="small" onClick={onToggleGrid} color={showGrid ? 'primary' : 'default'}>
            <GridIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Filter">
          <IconButton onClick={onToggleFilter} size="small" sx={{ color: filterActive ? '#2196f3' : undefined }}>
            <FilterListIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title={t('export')}>
          <IconButton size="small" onClick={e => setExportAnchor(e.currentTarget)}>
            <ExportIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
          <MenuItem onClick={() => { onExportSvg(); setExportAnchor(null); }}><ListItemText>{t('exportSvg')}</ListItemText></MenuItem>
          <MenuItem onClick={() => { onExportDrawio(); setExportAnchor(null); }}><ListItemText>{t('exportDrawio')}</ListItemText></MenuItem>
        </Menu>

        <Tooltip title={t('import')}>
          <IconButton size="small" onClick={onImportDrawio}>
            <ImportIcon fontSize="small" />
          </IconButton>
        </Tooltip>

      </Toolbar>
    </AppBar>
  );
}
