'use client';

import React from 'react';
import {
  Box, Typography, TextField, Slider, Divider, IconButton,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { GraphNode, GraphEdge } from '../types';

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
        width: 240, backgroundColor: '#121212',
        borderLeft: '1px solid rgba(255,255,255,0.12)',
        p: 2, overflowY: 'auto', zIndex: 20,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ color: '#FFFFFF' }}>Properties</Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: 'rgba(255,255,255,0.70)' }}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {selectedNode && (
        <>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.70)' }}>Fill Color</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {COLORS.map(c => (
              <Box
                key={c}
                onClick={() => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, fill: c } })}
                sx={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedNode.style.fill === c ? '2px solid #90CAF9' : '1px solid rgba(255,255,255,0.12)',
                }}
              />
            ))}
          </Box>

          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.70)' }}>Stroke Color</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {COLORS.map(c => (
              <Box
                key={c}
                onClick={() => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, stroke: c } })}
                sx={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedNode.style.stroke === c ? '2px solid #90CAF9' : '1px solid rgba(255,255,255,0.12)',
                }}
              />
            ))}
          </Box>

          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.70)' }}>Stroke Width</Typography>
          <Slider
            value={selectedNode.style.strokeWidth}
            min={0} max={10} step={0.5}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, strokeWidth: v as number } })}
            size="small"
            sx={{ mb: 2, color: '#90CAF9' }}
          />

          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.70)' }}>Font Size</Typography>
          <Slider
            value={selectedNode.style.fontSize}
            min={8} max={48} step={1}
            onChange={(_, v) => onUpdateNode(selectedNode.id, { style: { ...selectedNode.style, fontSize: v as number } })}
            size="small"
            sx={{ mb: 2, color: '#90CAF9' }}
          />
        </>
      )}

      {selectedEdge && (
        <>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.70)' }}>Stroke Color</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {COLORS.map(c => (
              <Box
                key={c}
                onClick={() => onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, stroke: c } })}
                sx={{
                  width: 24, height: 24, backgroundColor: c, borderRadius: '4px', cursor: 'pointer',
                  border: selectedEdge.style.stroke === c ? '2px solid #90CAF9' : '1px solid rgba(255,255,255,0.12)',
                }}
              />
            ))}
          </Box>

          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.70)' }}>Stroke Width</Typography>
          <Slider
            value={selectedEdge.style.strokeWidth}
            min={1} max={10} step={0.5}
            onChange={(_, v) => onUpdateEdge(selectedEdge.id, { style: { ...selectedEdge.style, strokeWidth: v as number } })}
            size="small"
            sx={{ color: '#90CAF9' }}
          />
        </>
      )}
    </Box>
  );
}
