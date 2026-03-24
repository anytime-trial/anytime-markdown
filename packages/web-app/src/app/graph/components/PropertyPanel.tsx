'use client';

import React from 'react';
import {
  Box, Typography, TextField, Slider, Divider, IconButton, Tooltip,
} from '@mui/material';
import {
  Close as CloseIcon,
  CropSquare as RectIcon,
  CircleOutlined as EllipseIcon,
  StickyNote2Outlined as StickyIcon,
  TextFields as TextIcon,
  Diamond as DiamondIcon,
  Hexagon as ParallelogramIcon,
  Storage as CylinderIcon,
  Lightbulb as InsightIcon,
  Description as DocIcon,
} from '@mui/icons-material';
import { GraphNode, GraphEdge, NodeType } from '../types';
import {
  COLOR_CHARCOAL, COLOR_BORDER, COLOR_ICE_BLUE,
  COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY,
  INSIGHT_LABEL_COLORS,
} from '@anytime-markdown/graph-core';

const SHAPE_OPTIONS: { type: NodeType; icon: React.ReactNode; label: string }[] = [
  { type: 'rect', icon: <RectIcon fontSize="small" />, label: 'Rectangle' },
  { type: 'ellipse', icon: <EllipseIcon fontSize="small" />, label: 'Ellipse' },
  { type: 'diamond', icon: <DiamondIcon fontSize="small" />, label: 'Diamond' },
  { type: 'parallelogram', icon: <ParallelogramIcon fontSize="small" />, label: 'Parallelogram' },
  { type: 'cylinder', icon: <CylinderIcon fontSize="small" />, label: 'Cylinder' },
  { type: 'sticky', icon: <StickyIcon fontSize="small" />, label: 'Sticky' },
  { type: 'text', icon: <TextIcon fontSize="small" />, label: 'Text' },
  { type: 'insight', icon: <InsightIcon fontSize="small" />, label: 'Insight' },
  { type: 'doc', icon: <DocIcon fontSize="small" />, label: 'Document' },
];

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
  onClose: () => void;
}

export function PropertyPanel({ selectedNode, selectedEdge, onUpdateNode, onUpdateEdge, onClose }: PropertyPanelProps) {
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
        <Typography variant="subtitle2" sx={{ color: COLOR_TEXT_PRIMARY }}>Properties</Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: COLOR_TEXT_SECONDARY }}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {selectedNode && (
        <>
          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>Shape</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {SHAPE_OPTIONS.map(s => (
              <Tooltip key={s.type} title={s.label}>
                <IconButton
                  size="small"
                  onClick={() => onUpdateNode(selectedNode.id, { type: s.type })}
                  sx={{
                    color: selectedNode.type === s.type ? COLOR_ICE_BLUE : COLOR_TEXT_SECONDARY,
                    border: selectedNode.type === s.type ? `1px solid ${COLOR_ICE_BLUE}` : `1px solid ${COLOR_BORDER}`,
                    borderRadius: '6px',
                    width: 32, height: 32,
                  }}
                >
                  {s.icon}
                </IconButton>
              </Tooltip>
            ))}
          </Box>

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>Fill Color</Typography>
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

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>Stroke Color</Typography>
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

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>Stroke Width</Typography>
          <Slider
            value={selectedNode.style.strokeWidth}
            min={0} max={10} step={0.5}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, strokeWidth: v as number } })}
            size="small"
            sx={{ mb: 2, color: COLOR_ICE_BLUE }}
          />

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>Font Size</Typography>
          <Slider
            value={selectedNode.style.fontSize}
            min={8} max={48} step={1}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, fontSize: v as number } })}
            size="small"
            sx={{ mb: 2, color: COLOR_ICE_BLUE }}
          />

          {selectedNode.type === 'insight' && (
            <>
              <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>Label</Typography>
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
              <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>Label Color</Typography>
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
          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>Stroke Color</Typography>
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

          <Typography variant="caption" sx={{ color: COLOR_TEXT_SECONDARY }}>Stroke Width</Typography>
          <Slider
            value={selectedEdge.style.strokeWidth}
            min={1} max={10} step={0.5}
            onChange={(_, v) => onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, strokeWidth: v as number } })}
            size="small"
            sx={{ color: COLOR_ICE_BLUE }}
          />
        </>
      )}
    </Box>
  );
}
