'use client';

import {
  getCanvasColors,
} from '@anytime-markdown/graph-core';
import {
  ArrowDownward as DownIcon,
  ArrowUpward as UpIcon,
  Close as CloseIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  VerticalAlignBottom as BottomIcon,
  VerticalAlignTop as TopIcon,
} from '@mui/icons-material';
import {
  Box, Divider, FormControlLabel,
IconButton, Slider,   Switch, TextField, ToggleButton, ToggleButtonGroup,
Typography, } from '@mui/material';
import { useTranslations } from 'next-intl';
import React from 'react';

import { EndpointShape,GraphEdge, GraphNode } from '../types';

const COLORS = [
  '#ffffff', '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688',
  '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107',
  '#ff9800', '#ff5722', '#795548', '#607d8b', '#333333',
];

function ColorPalette({
  colors,
  selectedColor,
  onSelect,
  label,
  themeMode = 'dark',
}: Readonly<{
  colors: string[];
  selectedColor: string;
  onSelect: (color: string) => void;
  label: string;
  themeMode?: 'light' | 'dark';
}>) {
  const isDark = themeMode === 'dark';
  const themeColors = getCanvasColors(isDark);
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % colors.length;
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + colors.length) % colors.length;
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === ' ') {
      onSelect(colors[index]);
      e.preventDefault();
      return;
    } else {
      return;
    }
    const container = (e.target as HTMLElement).parentElement;
    const next = container?.children[nextIndex] as HTMLElement | undefined;
    next?.focus();
  };

  return (
    <Box role="radiogroup" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
      {colors.map((c, i) => (
        <Box
          key={c}
          role="radio"
          aria-checked={selectedColor === c}
          aria-label={c}
          tabIndex={selectedColor === c ? 0 : -1}
          onClick={() => onSelect(c)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          sx={{
            width: 24,
            height: 24,
            backgroundColor: c,
            borderRadius: '4px',
            cursor: 'pointer',
            border: selectedColor === c ? `2px solid ${themeColors.accentColor}` : `1px solid ${themeColors.panelBorder}`,
            '&:focus-visible': {
              outline: `2px solid ${themeColors.accentColor}`,
              outlineOffset: '2px',
            },
          }}
        />
      ))}
    </Box>
  );
}

interface PropertyPanelProps {
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
  onUpdateNode: (id: string, changes: Partial<GraphNode>) => void;
  onUpdateEdge: (id: string, changes: Partial<GraphEdge>) => void;
  onLayerAction?: (action: 'up' | 'down' | 'top' | 'bottom') => void;
  onClose: () => void;
  themeMode?: 'light' | 'dark';
}

export function PropertyPanel({ selectedNode, selectedEdge, onUpdateNode, onUpdateEdge, onLayerAction, onClose, themeMode = 'dark' }: Readonly<PropertyPanelProps>) {
  const t = useTranslations('Graph');
  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);
  if (!selectedNode && !selectedEdge) return null;

  return (
    <Box
      sx={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: 240, backgroundColor: colors.panelBg,
        borderLeft: `1px solid ${colors.panelBorder}`,
        p: 2, overflowY: 'auto', zIndex: 20,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ color: colors.textPrimary }}>{t('properties')}</Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: colors.textSecondary }}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {selectedNode && (
        <>
          {/* ロック & レイヤー */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
            <IconButton
              size="small"
              onClick={() => onUpdateNode(selectedNode.id, { locked: !selectedNode.locked })}
              aria-label={selectedNode.locked ? t('unlock') : t('lock')}
              sx={{ color: selectedNode.locked ? colors.accentColor : colors.textSecondary }}
            >
              {selectedNode.locked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
            </IconButton>
            <Typography variant="caption" sx={{ color: colors.textSecondary, flex: 1 }}>
              {selectedNode.locked ? t('locked') : t('unlocked')}
            </Typography>
            <IconButton size="small" onClick={() => onLayerAction?.('top')} aria-label={t('layerTop')} sx={{ color: colors.textSecondary }}>
              <TopIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => onLayerAction?.('up')} aria-label={t('layerUp')} sx={{ color: colors.textSecondary }}>
              <UpIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => onLayerAction?.('down')} aria-label={t('layerDown')} sx={{ color: colors.textSecondary }}>
              <DownIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => onLayerAction?.('bottom')} aria-label={t('layerBottom')} sx={{ color: colors.textSecondary }}>
              <BottomIcon fontSize="small" />
            </IconButton>
          </Box>

          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('fillColor')}</Typography>
          <ColorPalette
            colors={COLORS}
            selectedColor={selectedNode.style.fill}
            onSelect={(c) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, fill: c } })}
            label={t('fillColor')}
            themeMode={themeMode}
          />

          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('strokeColor')}</Typography>
          <ColorPalette
            colors={COLORS}
            selectedColor={selectedNode.style.stroke}
            onSelect={(c) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, stroke: c } })}
            label={t('strokeColor')}
            themeMode={themeMode}
          />

          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('strokeWidth')}</Typography>
          <Slider
            value={selectedNode.style.strokeWidth}
            min={0} max={10} step={0.5}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, strokeWidth: v as number } })}
            size="small"
            aria-label={t('strokeWidth')}
            sx={{ mb: 2, color: colors.accentColor }}
          />

          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('fontSize')}</Typography>
          <Slider
            value={selectedNode.style.fontSize}
            min={8} max={48} step={1}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, fontSize: v as number } })}
            size="small"
            aria-label={t('fontSize')}
            sx={{ mb: 2, color: colors.accentColor }}
          />

          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('borderRadius')}</Typography>
          <Slider
            value={selectedNode.style.borderRadius ?? 0}
            min={0} max={30} step={1}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, borderRadius: v as number } })}
            size="small"
            aria-label={t('borderRadius')}
            sx={{ mb: 2, color: colors.accentColor }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={selectedNode.style.shadow ?? false}
                onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, shadow: v } })}
                size="small"
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: colors.accentColor }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: colors.accentColor } }}
              />
            }
            label={<Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('shadow')}</Typography>}
            sx={{ mb: 1 }}
          />

          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('gradientTo')}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            <Box
              onClick={() => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, gradientTo: undefined } })}
              sx={{
                width: 24, height: 24, borderRadius: '4px', cursor: 'pointer',
                background: 'linear-gradient(135deg, #666 25%, transparent 25%, transparent 75%, #666 75%)',
                backgroundSize: '8px 8px',
                border: selectedNode.style.gradientTo ? `1px solid ${colors.panelBorder}` : `2px solid ${colors.accentColor}`,
              }}
            />
            {COLORS.slice(0, 10).map(c => (
              <Box
                key={c}
                onClick={() => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, gradientTo: c } })}
                sx={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedNode.style.gradientTo === c ? `2px solid ${colors.accentColor}` : `1px solid ${colors.panelBorder}`,
                }}
              />
            ))}
          </Box>

          {selectedNode.style.gradientTo && (
            <>
              <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('gradientDirection')}</Typography>
              <ToggleButtonGroup
                value={selectedNode.style.gradientDirection ?? 'vertical'}
                exclusive
                onChange={(_, v) => v && onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, gradientDirection: v } })}
                size="small"
                sx={{ mb: 2, display: 'flex', '& .MuiToggleButton-root': { flex: 1, fontSize: '0.65rem', py: 0.3, color: colors.textSecondary, borderColor: colors.panelBorder, '&.Mui-selected': { color: colors.accentColor, backgroundColor: `${colors.accentColor}1F` } } }}
              >
                <ToggleButton value="vertical" aria-label={t('gradientVertical')}>↕</ToggleButton>
                <ToggleButton value="horizontal" aria-label={t('gradientHorizontal')}>↔</ToggleButton>
                <ToggleButton value="diagonal" aria-label={t('gradientDiagonal')}>↗</ToggleButton>
              </ToggleButtonGroup>
            </>
          )}

          {/* URL */}
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('url')}</Typography>
          <TextField
            value={selectedNode.url ?? ''}
            onChange={(e) => onUpdateNode(selectedNode.id, { url: e.target.value || undefined })}
            size="small"
            fullWidth
            placeholder="https://..."
            sx={{
              mb: 2,
              '& .MuiInputBase-input': { color: colors.textPrimary, fontSize: '0.8rem', py: 0.5 },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.panelBorder },
            }}
          />

          {/* 接続点 */}
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('connectionPoints')}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.65rem' }}>
              {4 + (selectedNode.extraConnectionPoints?.length ?? 0)} {t('points')}
            </Typography>
            <IconButton
              size="small"
              onClick={() => {
                const current = selectedNode.extraConnectionPoints ?? [];
                const newPoints = [
                  { x: 0.25, y: 0 }, { x: 0.75, y: 0 },
                  { x: 1, y: 0.25 }, { x: 1, y: 0.75 },
                  { x: 0.25, y: 1 }, { x: 0.75, y: 1 },
                  { x: 0, y: 0.25 }, { x: 0, y: 0.75 },
                ].filter(np => !current.some(cp => cp.x === np.x && cp.y === np.y));
                onUpdateNode(selectedNode.id, { extraConnectionPoints: [...current, ...newPoints] });
              }}
              aria-label={t('addConnectionPoints')}
              sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}
            >
              <Typography variant="caption">+8</Typography>
            </IconButton>
            {(selectedNode.extraConnectionPoints?.length ?? 0) > 0 && (
              <IconButton
                size="small"
                onClick={() => onUpdateNode(selectedNode.id, { extraConnectionPoints: undefined })}
                aria-label={t('resetConnectionPoints')}
                sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}
              >
                <Typography variant="caption">{t('reset')}</Typography>
              </IconButton>
            )}
          </Box>
        </>
      )}

      {selectedEdge && (
        <>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('strokeColor')}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {COLORS.map(c => (
              <Box
                key={c}
                onClick={() => onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, stroke: c } })}
                sx={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedEdge.style.stroke === c ? `2px solid ${colors.accentColor}` : `1px solid ${colors.panelBorder}`,
                }}
              />
            ))}
          </Box>

          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('strokeWidth')}</Typography>
          <Slider
            value={selectedEdge.style.strokeWidth}
            min={1} max={10} step={0.5}
            onChange={(_, v) => onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, strokeWidth: v as number } })}
            size="small"
            aria-label={t('strokeWidth')}
            sx={{ mb: 2, color: colors.accentColor }}
          />

          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('startShape')}</Typography>
          <ToggleButtonGroup
            value={selectedEdge.style.startShape ?? 'none'}
            exclusive
            onChange={(_, v) => v && onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, startShape: v as EndpointShape } })}
            size="small"
            sx={{ mb: 2, display: 'flex', '& .MuiToggleButton-root': { flex: 1, fontSize: '0.65rem', py: 0.3, color: colors.textSecondary, borderColor: colors.panelBorder, '&.Mui-selected': { color: colors.accentColor, backgroundColor: `${colors.accentColor}1F` } } }}
          >
            <ToggleButton value="none">{t('shapeNone')}</ToggleButton>
            <ToggleButton value="arrow">{t('shapeArrow')}</ToggleButton>
            <ToggleButton value="circle">{t('shapeCircle')}</ToggleButton>
            <ToggleButton value="diamond">{t('shapeDiamond')}</ToggleButton>
            <ToggleButton value="bar">{t('shapeBar')}</ToggleButton>
          </ToggleButtonGroup>

          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('endShape')}</Typography>
          <ToggleButtonGroup
            value={selectedEdge.style.endShape ?? (selectedEdge.type === 'connector' ? 'arrow' : 'none')}
            exclusive
            onChange={(_, v) => v && onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, endShape: v as EndpointShape } })}
            size="small"
            sx={{ mb: 2, display: 'flex', '& .MuiToggleButton-root': { flex: 1, fontSize: '0.65rem', py: 0.3, color: colors.textSecondary, borderColor: colors.panelBorder, '&.Mui-selected': { color: colors.accentColor, backgroundColor: `${colors.accentColor}1F` } } }}
          >
            <ToggleButton value="none">{t('shapeNone')}</ToggleButton>
            <ToggleButton value="arrow">{t('shapeArrow')}</ToggleButton>
            <ToggleButton value="circle">{t('shapeCircle')}</ToggleButton>
            <ToggleButton value="diamond">{t('shapeDiamond')}</ToggleButton>
            <ToggleButton value="bar">{t('shapeBar')}</ToggleButton>
          </ToggleButtonGroup>

          {/* ラベル */}
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('edgeLabel')}</Typography>
          <TextField
            value={selectedEdge.label ?? ''}
            onChange={(e) => onUpdateEdge(selectedEdge.id, { label: e.target.value || undefined })}
            size="small"
            fullWidth
            placeholder="Label"
            sx={{
              mb: 2,
              '& .MuiInputBase-input': { color: colors.textPrimary, fontSize: '0.8rem', py: 0.5 },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.panelBorder },
            }}
          />

          {/* ルーティングモード（connector タイプのみ） */}
          {selectedEdge.type === 'connector' && (
            <>
              <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('routing')}</Typography>
              <ToggleButtonGroup
                value={selectedEdge.style.routing ?? 'orthogonal'}
                exclusive
                onChange={(_, v) => v && onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, routing: v } })}
                size="small"
                sx={{ mb: 2, display: 'flex', '& .MuiToggleButton-root': { flex: 1, fontSize: '0.65rem', py: 0.3, color: colors.textSecondary, borderColor: colors.panelBorder, '&.Mui-selected': { color: colors.accentColor, backgroundColor: `${colors.accentColor}1F` } } }}
              >
                <ToggleButton value="orthogonal">{t('routingOrthogonal')}</ToggleButton>
                <ToggleButton value="bezier">{t('routingBezier')}</ToggleButton>
                <ToggleButton value="straight">{t('routingStraight')}</ToggleButton>
              </ToggleButtonGroup>
            </>
          )}
        </>
      )}
    </Box>
  );
}
