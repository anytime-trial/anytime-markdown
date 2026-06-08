'use client';

import {
  getCanvasColors,
} from '@anytime-markdown/graph-core';
import {
  ArrowDownwardIcon as DownIcon,
  ArrowUpwardIcon as UpIcon,
  Box,
  CloseIcon,
  Divider,
  FormControlLabel,
  IconButton,
  LockIcon,
  LockOpenIcon,
  Slider,
  Switch,
  Text,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  VerticalAlignBottomIcon as BottomIcon,
  VerticalAlignTopIcon as TopIcon,
} from '../ui';
import { useGraphT } from '../i18n/context';
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
    <Box role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
      {colors.map((c, i) => (
        <Box
          key={c}
          className="gv-color-swatch"
          role="radio"
          aria-checked={selectedColor === c}
          aria-label={c}
          tabIndex={selectedColor === c ? 0 : -1}
          onClick={() => onSelect(c)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          style={{
            width: 24,
            height: 24,
            backgroundColor: c,
            borderRadius: '4px',
            cursor: 'pointer',
            border: selectedColor === c ? `2px solid ${themeColors.accentColor}` : `1px solid ${themeColors.panelBorder}`,
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
  const t = useGraphT('Graph');
  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);
  if (!selectedNode && !selectedEdge) return null;

  return (
    <Box
      className="gv-scroll"
      style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: 240, backgroundColor: colors.panelBg,
        borderLeft: `1px solid ${colors.panelBorder}`,
        padding: 16, overflowY: 'auto', zIndex: 20,
      }}
    >
      <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text variant="subtitle2" style={{ color: colors.textPrimary }}>{t('properties')}</Text>
        <IconButton size="small" onClick={onClose} style={{ color: colors.textSecondary }}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Divider style={{ marginBottom: 16 }} />

      {selectedNode && (
        <>
          {/* ロック & レイヤー */}
          <Box style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
            <IconButton
              size="small"
              onClick={() => onUpdateNode(selectedNode.id, { locked: !selectedNode.locked })}
              aria-label={selectedNode.locked ? t('unlock') : t('lock')}
              style={{ color: selectedNode.locked ? colors.accentColor : colors.textSecondary }}
            >
              {selectedNode.locked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
            </IconButton>
            <Text variant="caption" style={{ color: colors.textSecondary, flex: 1 }}>
              {selectedNode.locked ? t('locked') : t('unlocked')}
            </Text>
            <IconButton size="small" onClick={() => onLayerAction?.('top')} aria-label={t('layerTop')} style={{ color: colors.textSecondary }}>
              <TopIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => onLayerAction?.('up')} aria-label={t('layerUp')} style={{ color: colors.textSecondary }}>
              <UpIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => onLayerAction?.('down')} aria-label={t('layerDown')} style={{ color: colors.textSecondary }}>
              <DownIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => onLayerAction?.('bottom')} aria-label={t('layerBottom')} style={{ color: colors.textSecondary }}>
              <BottomIcon fontSize="small" />
            </IconButton>
          </Box>

          <Text variant="caption" style={{ color: colors.textSecondary }}>{t('fillColor')}</Text>
          <ColorPalette
            colors={COLORS}
            selectedColor={selectedNode.style.fill}
            onSelect={(c) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, fill: c } })}
            label={t('fillColor')}
            themeMode={themeMode}
          />

          <Text variant="caption" style={{ color: colors.textSecondary }}>{t('strokeColor')}</Text>
          <ColorPalette
            colors={COLORS}
            selectedColor={selectedNode.style.stroke}
            onSelect={(c) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, stroke: c } })}
            label={t('strokeColor')}
            themeMode={themeMode}
          />

          <Text variant="caption" style={{ color: colors.textSecondary }}>{t('strokeWidth')}</Text>
          <Slider
            value={selectedNode.style.strokeWidth}
            min={0} max={10} step={0.5}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, strokeWidth: v as number } })}
            size="small"
            aria-label={t('strokeWidth')}
            style={{ marginBottom: 16 }}
          />

          <Text variant="caption" style={{ color: colors.textSecondary }}>{t('fontSize')}</Text>
          <Slider
            value={selectedNode.style.fontSize}
            min={8} max={48} step={1}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, fontSize: v as number } })}
            size="small"
            aria-label={t('fontSize')}
            style={{ marginBottom: 16 }}
          />

          <Text variant="caption" style={{ color: colors.textSecondary }}>{t('borderRadius')}</Text>
          <Slider
            value={selectedNode.style.borderRadius ?? 0}
            min={0} max={30} step={1}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, borderRadius: v as number } })}
            size="small"
            aria-label={t('borderRadius')}
            style={{ marginBottom: 16 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={selectedNode.style.shadow ?? false}
                onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, shadow: v } })}
                size="small"
              />
            }
            label={<Text variant="caption" style={{ color: colors.textSecondary }}>{t('shadow')}</Text>}
            style={{ marginBottom: 8 }}
          />

          <Text variant="caption" style={{ color: colors.textSecondary, display: 'block' }}>{t('gradientTo')}</Text>
          <Box style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            <Box
              onClick={() => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, gradientTo: undefined } })}
              style={{
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
                style={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedNode.style.gradientTo === c ? `2px solid ${colors.accentColor}` : `1px solid ${colors.panelBorder}`,
                }}
              />
            ))}
          </Box>

          {selectedNode.style.gradientTo && (
            <>
              <Text variant="caption" style={{ color: colors.textSecondary, display: 'block' }}>{t('gradientDirection')}</Text>
              <ToggleButtonGroup
                value={selectedNode.style.gradientDirection ?? 'vertical'}
                exclusive
                onChange={(_, v) => v && onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, gradientDirection: v as 'vertical' | 'horizontal' | 'diagonal' } })}
                size="small"
                fullWidth
                style={{ marginBottom: 16 }}
              >
                <ToggleButton value="vertical" aria-label={t('gradientVertical')}>↕</ToggleButton>
                <ToggleButton value="horizontal" aria-label={t('gradientHorizontal')}>↔</ToggleButton>
                <ToggleButton value="diagonal" aria-label={t('gradientDiagonal')}>↗</ToggleButton>
              </ToggleButtonGroup>
            </>
          )}

          {/* URL */}
          <Text variant="caption" style={{ color: colors.textSecondary, display: 'block' }}>{t('url')}</Text>
          <TextField
            value={selectedNode.url ?? ''}
            onChange={(e) => onUpdateNode(selectedNode.id, { url: e.target.value || undefined })}
            size="small"
            fullWidth
            placeholder="https://..."
            style={{ marginBottom: 16 }}
          />

          {/* 接続点 */}
          <Divider style={{ margin: '8px 0' }} />
          <Text variant="caption" style={{ color: colors.textSecondary, display: 'block' }}>{t('connectionPoints')}</Text>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Text variant="caption" style={{ color: colors.textSecondary, fontSize: '0.65rem' }}>
              {4 + (selectedNode.extraConnectionPoints?.length ?? 0)} {t('points')}
            </Text>
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
              style={{ color: colors.textSecondary, fontSize: '0.7rem' }}
            >
              <Text variant="caption">+8</Text>
            </IconButton>
            {(selectedNode.extraConnectionPoints?.length ?? 0) > 0 && (
              <IconButton
                size="small"
                onClick={() => onUpdateNode(selectedNode.id, { extraConnectionPoints: undefined })}
                aria-label={t('resetConnectionPoints')}
                style={{ color: colors.textSecondary, fontSize: '0.7rem' }}
              >
                <Text variant="caption">{t('reset')}</Text>
              </IconButton>
            )}
          </Box>
        </>
      )}

      {selectedEdge && (
        <>
          <Text variant="caption" style={{ color: colors.textSecondary }}>{t('strokeColor')}</Text>
          <Box style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
            {COLORS.map(c => (
              <Box
                key={c}
                onClick={() => onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, stroke: c } })}
                style={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedEdge.style.stroke === c ? `2px solid ${colors.accentColor}` : `1px solid ${colors.panelBorder}`,
                }}
              />
            ))}
          </Box>

          <Text variant="caption" style={{ color: colors.textSecondary }}>{t('strokeWidth')}</Text>
          <Slider
            value={selectedEdge.style.strokeWidth}
            min={1} max={10} step={0.5}
            onChange={(_, v) => onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, strokeWidth: v as number } })}
            size="small"
            aria-label={t('strokeWidth')}
            style={{ marginBottom: 16 }}
          />

          <Text variant="caption" style={{ color: colors.textSecondary, display: 'block' }}>{t('startShape')}</Text>
          <ToggleButtonGroup
            value={selectedEdge.style.startShape ?? 'none'}
            exclusive
            onChange={(_, v) => v && onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, startShape: v as EndpointShape } })}
            size="small"
            fullWidth
            style={{ marginBottom: 16 }}
          >
            <ToggleButton value="none">{t('shapeNone')}</ToggleButton>
            <ToggleButton value="arrow">{t('shapeArrow')}</ToggleButton>
            <ToggleButton value="circle">{t('shapeCircle')}</ToggleButton>
            <ToggleButton value="diamond">{t('shapeDiamond')}</ToggleButton>
            <ToggleButton value="bar">{t('shapeBar')}</ToggleButton>
          </ToggleButtonGroup>

          <Text variant="caption" style={{ color: colors.textSecondary, display: 'block' }}>{t('endShape')}</Text>
          <ToggleButtonGroup
            value={selectedEdge.style.endShape ?? (selectedEdge.type === 'connector' ? 'arrow' : 'none')}
            exclusive
            onChange={(_, v) => v && onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, endShape: v as EndpointShape } })}
            size="small"
            fullWidth
            style={{ marginBottom: 16 }}
          >
            <ToggleButton value="none">{t('shapeNone')}</ToggleButton>
            <ToggleButton value="arrow">{t('shapeArrow')}</ToggleButton>
            <ToggleButton value="circle">{t('shapeCircle')}</ToggleButton>
            <ToggleButton value="diamond">{t('shapeDiamond')}</ToggleButton>
            <ToggleButton value="bar">{t('shapeBar')}</ToggleButton>
          </ToggleButtonGroup>

          {/* ラベル */}
          <Text variant="caption" style={{ color: colors.textSecondary, display: 'block' }}>{t('edgeLabel')}</Text>
          <TextField
            value={selectedEdge.label ?? ''}
            onChange={(e) => onUpdateEdge(selectedEdge.id, { label: e.target.value || undefined })}
            size="small"
            fullWidth
            placeholder="Label"
            style={{ marginBottom: 16 }}
          />

          {/* ルーティングモード（connector タイプのみ） */}
          {selectedEdge.type === 'connector' && (
            <>
              <Text variant="caption" style={{ color: colors.textSecondary, display: 'block' }}>{t('routing')}</Text>
              <ToggleButtonGroup
                value={selectedEdge.style.routing ?? 'orthogonal'}
                exclusive
                onChange={(_, v) => v && onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, routing: v as 'orthogonal' | 'bezier' | 'straight' } })}
                size="small"
                fullWidth
                style={{ marginBottom: 16 }}
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
