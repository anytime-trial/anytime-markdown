'use client';

import React, { useState } from 'react';
import {
  AppBar, Toolbar, ToggleButton, ToggleButtonGroup,
  IconButton, Tooltip, Divider, Box, Menu, MenuItem,
  ListItemIcon, ListItemText,
} from '@mui/material';
import {
  NearMe as SelectIcon,
  CropSquare as RectIcon,
  StickyNote2Outlined as StickyIcon,
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
  Lightbulb as InsightIcon,
  Description as DocIcon,
  Dashboard as FrameIcon,
  CloudDone as CloudDoneIcon,
  CloudSync as CloudSyncIcon,
  CloudOff as CloudOffIcon,
  CircleOutlined as EllipseIcon,
  DiamondOutlined as DiamondIcon,
  ChangeHistoryOutlined as ParallelogramIcon,
  StorageOutlined as CylinderIcon,
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { ToolType } from '../types';
import { SaveStatus } from '../hooks/useAutoSave';
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
}

export function GraphToolBar({
  tool, onToolChange, onUndo, onRedo, canUndo, canRedo,
  showGrid, onToggleGrid, onZoomIn, onZoomOut, onFitContent,
  onClearAll, onExportSvg, onExportDrawio, onImportDrawio, onAlign, onSetScale, selectionCount, hasSelection, scale, saveStatus,
}: ToolBarProps) {
  const t = useTranslations('Graph');
  const [alignAnchor, setAlignAnchor] = React.useState<null | HTMLElement>(null);
  const [exportAnchor, setExportAnchor] = React.useState<null | HTMLElement>(null);
  const [zoomAnchor, setZoomAnchor] = useState<null | HTMLElement>(null);
  const saveStatusLabels: Record<SaveStatus, string> = { saved: t('saved'), saving: t('saving'), error: t('saveError') };
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
          <ToggleButton value="select" aria-label={t('select')}>
            <Tooltip title={`${t('select')} (V)`}><SelectIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="rect" aria-label={t('rect')}>
            <Tooltip title={`${t('rect')} (R)`}><RectIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="ellipse" aria-label={t('ellipse')}>
            <Tooltip title={t('ellipse')}><EllipseIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="diamond" aria-label={t('diamond')}>
            <Tooltip title={t('diamond')}><DiamondIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="parallelogram" aria-label={t('parallelogram')}>
            <Tooltip title={t('parallelogram')}><ParallelogramIcon fontSize="small" sx={{ transform: 'rotate(90deg) skewX(-15deg)' }} /></Tooltip>
          </ToggleButton>
          <ToggleButton value="cylinder" aria-label={t('cylinder')}>
            <Tooltip title={t('cylinder')}><CylinderIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="sticky" aria-label={t('sticky')}>
            <Tooltip title={`${t('sticky')} (S)`}><StickyIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="text" aria-label={t('text')}>
            <Tooltip title={`${t('text')} (T)`}><TextIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="insight" aria-label={t('insight')}>
            <Tooltip title={`${t('insight')} (I)`}><InsightIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="doc" aria-label={t('doc')}>
            <Tooltip title={`${t('doc')} (M)`}><DocIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="frame" aria-label={t('frame')}>
            <Tooltip title={`${t('frame')} (F)`}><FrameIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="line" aria-label={t('line')}>
            <Tooltip title={`${t('line')} (L)`}><LineIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="pan" aria-label={t('pan')}>
            <Tooltip title={`${t('pan')} (Space)`}><PanIcon fontSize="small" /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

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

        <Box sx={{ flex: 1 }} />

        <Tooltip title={t('zoomOut')}>
          <IconButton size="small" onClick={onZoomOut}><ZoomOutIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Box
          onClick={(e) => setZoomAnchor(e.currentTarget)}
          sx={{ minWidth: 48, textAlign: 'center', fontSize: '0.75rem', color: 'text.secondary', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, borderRadius: 1, px: 0.5 }}
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

        <Tooltip title={saveStatusLabels[saveStatus]}>
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
