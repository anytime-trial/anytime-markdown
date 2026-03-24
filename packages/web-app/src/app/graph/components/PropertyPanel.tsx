'use client';

import React from 'react';
import {
  Box, Typography, TextField, Slider, Divider, IconButton, ToggleButton, ToggleButtonGroup,
  Switch, FormControlLabel, Select, MenuItem as MuiMenuItem, FormControl,
} from '@mui/material';
import {
  Close as CloseIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
  VerticalAlignTop as TopIcon,
  VerticalAlignBottom as BottomIcon,
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { GraphNode, GraphEdge, EndpointShape } from '../types';
import {
  COLOR_CHARCOAL, COLOR_BORDER, COLOR_ICE_BLUE,
  COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY,
  INSIGHT_LABEL_COLORS,
} from '@anytime-markdown/graph-core';

const COLORS = [
  '#ffffff', '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688',
  '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107',
  '#ff9800', '#ff5722', '#795548', '#607d8b', '#333333',
];

interface PropertyPanelProps {
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
  onUpdateNode: (id: string, changes: Partial<GraphNode>) => void;
  onUpdateEdge: (id: string, changes: Partial<GraphEdge>) => void;
  onLayerAction?: (action: 'up' | 'down' | 'top' | 'bottom') => void;
  onClose: () => void;
}

export function PropertyPanel({ selectedNode, selectedEdge, onUpdateNode, onUpdateEdge, onLayerAction, onClose }: PropertyPanelProps) {
  const t = useTranslations('Graph');
  if (!selectedNode && !selectedEdge) return null;

  return (
    <Box
      sx={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: 240, backgroundColor: COLOR_CHARCOAL,
        borderLeft: `1px solid ${COLOR_BORDER}`,
        p: 2, overflowY: 'auto', zIndex: 20,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ color: COLOR_TEXT_PRIMARY }}>{t('properties')}</Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: COLOR_TEXT_SECONDARY }}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {selectedNode && (
        <>
          {/* ロック & レイヤー */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
            <IconButton
              size="small"
              onClick={() => onUpdateNode(selectedNode.id, { locked: !selectedNode.locked })}
              sx={{ color: selectedNode.locked ? COLOR_ICE_BLUE : COLOR_TEXT_SECONDARY }}
            >
              {selectedNode.locked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
            </IconButton>
            <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY, flex: 1 }}>
              {selectedNode.locked ? t('locked') : t('unlocked')}
            </Typography>
            <IconButton size="small" onClick={() => onLayerAction?.('top')} sx={{ color: COLOR_TEXT_SECONDARY }}>
              <TopIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => onLayerAction?.('up')} sx={{ color: COLOR_TEXT_SECONDARY }}>
              <UpIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => onLayerAction?.('down')} sx={{ color: COLOR_TEXT_SECONDARY }}>
              <DownIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => onLayerAction?.('bottom')} sx={{ color: COLOR_TEXT_SECONDARY }}>
              <BottomIcon fontSize="small" />
            </IconButton>
          </Box>

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('fillColor')}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {COLORS.map(c => (
              <Box
                key={c}
                onClick={() => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, fill: c } })}
                sx={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedNode.style.fill === c ? `2px solid ${COLOR_ICE_BLUE}` : `1px solid ${COLOR_BORDER}`,
                }}
              />
            ))}
          </Box>

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('strokeColor')}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {COLORS.map(c => (
              <Box
                key={c}
                onClick={() => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, stroke: c } })}
                sx={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedNode.style.stroke === c ? `2px solid ${COLOR_ICE_BLUE}` : `1px solid ${COLOR_BORDER}`,
                }}
              />
            ))}
          </Box>

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('strokeWidth')}</Typography>
          <Slider
            value={selectedNode.style.strokeWidth}
            min={0} max={10} step={0.5}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, strokeWidth: v as number } })}
            size="small"
            sx={{ mb: 2, color: COLOR_ICE_BLUE }}
          />

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('fontSize')}</Typography>
          <Slider
            value={selectedNode.style.fontSize}
            min={8} max={48} step={1}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, fontSize: v as number } })}
            size="small"
            sx={{ mb: 2, color: COLOR_ICE_BLUE }}
          />

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('borderRadius')}</Typography>
          <Slider
            value={selectedNode.style.borderRadius ?? 0}
            min={0} max={30} step={1}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, borderRadius: v as number } })}
            size="small"
            sx={{ mb: 2, color: COLOR_ICE_BLUE }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={selectedNode.style.shadow ?? false}
                onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, shadow: v } })}
                size="small"
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLOR_ICE_BLUE }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: COLOR_ICE_BLUE } }}
              />
            }
            label={<Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('shadow')}</Typography>}
            sx={{ mb: 1 }}
          />

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('gradientTo')}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            <Box
              onClick={() => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, gradientTo: undefined } })}
              sx={{
                width: 24, height: 24, borderRadius: '4px', cursor: 'pointer',
                background: 'linear-gradient(135deg, #666 25%, transparent 25%, transparent 75%, #666 75%)',
                backgroundSize: '8px 8px',
                border: !selectedNode.style.gradientTo ? `2px solid ${COLOR_ICE_BLUE}` : `1px solid ${COLOR_BORDER}`,
              }}
            />
            {COLORS.slice(0, 10).map(c => (
              <Box
                key={c}
                onClick={() => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, gradientTo: c } })}
                sx={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedNode.style.gradientTo === c ? `2px solid ${COLOR_ICE_BLUE}` : `1px solid ${COLOR_BORDER}`,
                }}
              />
            ))}
          </Box>

          {selectedNode.style.gradientTo && (
            <>
              <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('gradientDirection')}</Typography>
              <ToggleButtonGroup
                value={selectedNode.style.gradientDirection ?? 'vertical'}
                exclusive
                onChange={(_, v) => v && onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, gradientDirection: v } })}
                size="small"
                sx={{ mb: 2, display: 'flex', '& .MuiToggleButton-root': { flex: 1, fontSize: '0.65rem', py: 0.3, color: COLOR_TEXT_SECONDARY, borderColor: COLOR_BORDER, '&.Mui-selected': { color: COLOR_ICE_BLUE, backgroundColor: 'rgba(144,202,249,0.12)' } } }}
              >
                <ToggleButton value="vertical">↕</ToggleButton>
                <ToggleButton value="horizontal">↔</ToggleButton>
                <ToggleButton value="diagonal">↗</ToggleButton>
              </ToggleButtonGroup>
            </>
          )}

          {selectedNode.type === 'insight' && (
            <>
              <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('label')}</Typography>
              <TextField
                value={selectedNode.label ?? ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { label: e.target.value })}
                size="small"
                fullWidth
                sx={{
                  mb: 2,
                  '& .MuiInputBase-input': { color: COLOR_TEXT_PRIMARY, fontSize: '0.8rem', py: 0.5 },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: COLOR_BORDER },
                }}
              />
              <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('labelColor')}</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
                {INSIGHT_LABEL_COLORS.map(c => (
                  <Box
                    key={c}
                    onClick={() => onUpdateNode(selectedNode.id, { labelColor: c })}
                    sx={{
                      width: 28, height: 28, backgroundColor: c, borderRadius: '50%', cursor: 'pointer',
                      border: selectedNode.labelColor === c ? `2px solid ${COLOR_TEXT_PRIMARY}` : `1px solid ${COLOR_BORDER}`,
                    }}
                  />
                ))}
              </Box>
            </>
          )}
        </>
      )}

      {selectedEdge && (
        <>
          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('strokeColor')}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {COLORS.map(c => (
              <Box
                key={c}
                onClick={() => onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, stroke: c } })}
                sx={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedEdge.style.stroke === c ? `2px solid ${COLOR_ICE_BLUE}` : `1px solid ${COLOR_BORDER}`,
                }}
              />
            ))}
          </Box>

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('strokeWidth')}</Typography>
          <Slider
            value={selectedEdge.style.strokeWidth}
            min={1} max={10} step={0.5}
            onChange={(_, v) => onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, strokeWidth: v as number } })}
            size="small"
            sx={{ mb: 2, color: COLOR_ICE_BLUE }}
          />

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('startShape')}</Typography>
          <ToggleButtonGroup
            value={selectedEdge.style.startShape ?? 'none'}
            exclusive
            onChange={(_, v) => v && onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, startShape: v as EndpointShape } })}
            size="small"
            sx={{ mb: 2, display: 'flex', '& .MuiToggleButton-root': { flex: 1, fontSize: '0.65rem', py: 0.3, color: COLOR_TEXT_SECONDARY, borderColor: COLOR_BORDER, '&.Mui-selected': { color: COLOR_ICE_BLUE, backgroundColor: 'rgba(144,202,249,0.12)' } } }}
          >
            <ToggleButton value="none">{t('shapeNone')}</ToggleButton>
            <ToggleButton value="arrow">{t('shapeArrow')}</ToggleButton>
            <ToggleButton value="circle">{t('shapeCircle')}</ToggleButton>
            <ToggleButton value="diamond">{t('shapeDiamond')}</ToggleButton>
            <ToggleButton value="bar">{t('shapeBar')}</ToggleButton>
          </ToggleButtonGroup>

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>{t('endShape')}</Typography>
          <ToggleButtonGroup
            value={selectedEdge.style.endShape ?? ((selectedEdge.type === 'arrow' || selectedEdge.type === 'connector') ? 'arrow' : 'none')}
            exclusive
            onChange={(_, v) => v && onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, endShape: v as EndpointShape } })}
            size="small"
            sx={{ mb: 2, display: 'flex', '& .MuiToggleButton-root': { flex: 1, fontSize: '0.65rem', py: 0.3, color: COLOR_TEXT_SECONDARY, borderColor: COLOR_BORDER, '&.Mui-selected': { color: COLOR_ICE_BLUE, backgroundColor: 'rgba(144,202,249,0.12)' } } }}
          >
            <ToggleButton value="none">{t('shapeNone')}</ToggleButton>
            <ToggleButton value="arrow">{t('shapeArrow')}</ToggleButton>
            <ToggleButton value="circle">{t('shapeCircle')}</ToggleButton>
            <ToggleButton value="diamond">{t('shapeDiamond')}</ToggleButton>
            <ToggleButton value="bar">{t('shapeBar')}</ToggleButton>
          </ToggleButtonGroup>
        </>
      )}
    </Box>
  );
}
