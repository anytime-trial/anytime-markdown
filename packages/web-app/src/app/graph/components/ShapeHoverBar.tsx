'use client';

import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import {
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
import { GraphNode, NodeType, Viewport } from '../types';
import { worldToScreen } from '../engine/viewport';
import {
  COLOR_CHARCOAL, COLOR_BORDER, COLOR_ICE_BLUE,
  COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY,
} from '@anytime-markdown/graph-core';

const SHAPES: { type: NodeType; icon: React.ReactNode; label: string }[] = [
  { type: 'rect', icon: <RectIcon sx={{ fontSize: 18 }} />, label: 'Rectangle' },
  { type: 'ellipse', icon: <EllipseIcon sx={{ fontSize: 18 }} />, label: 'Ellipse' },
  { type: 'diamond', icon: <DiamondIcon sx={{ fontSize: 18 }} />, label: 'Diamond' },
  { type: 'parallelogram', icon: <ParallelogramIcon sx={{ fontSize: 18 }} />, label: 'Parallelogram' },
  { type: 'cylinder', icon: <CylinderIcon sx={{ fontSize: 18 }} />, label: 'Cylinder' },
  { type: 'sticky', icon: <StickyIcon sx={{ fontSize: 18 }} />, label: 'Sticky' },
  { type: 'text', icon: <TextIcon sx={{ fontSize: 18 }} />, label: 'Text' },
  { type: 'insight', icon: <InsightIcon sx={{ fontSize: 18 }} />, label: 'Insight' },
  { type: 'doc', icon: <DocIcon sx={{ fontSize: 18 }} />, label: 'Document' },
];

interface ShapeHoverBarProps {
  node: GraphNode;
  viewport: Viewport;
  onChangeType: (id: string, type: NodeType) => void;
}

export function ShapeHoverBar({ node, viewport, onChangeType }: ShapeHoverBarProps) {
  const screen = worldToScreen(viewport, node.x + node.width / 2, node.y);
  const barWidth = SHAPES.length * 30 + 16;

  return (
    <Box
      sx={{
        position: 'absolute',
        left: screen.x - barWidth / 2,
        top: screen.y - 44,
        display: 'flex',
        gap: '2px',
        backgroundColor: COLOR_CHARCOAL,
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: '8px',
        px: 1,
        py: 0.5,
        zIndex: 25,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        pointerEvents: 'auto',
        opacity: 0,
        animation: 'shapeBarFadeIn 300ms cubic-bezier(0, 0, 0.2, 1) 400ms forwards',
        '@keyframes shapeBarFadeIn': {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {SHAPES.map(s => (
        <Tooltip key={s.type} title={s.label} placement="top">
          <IconButton
            size="small"
            onClick={() => onChangeType(node.id, s.type)}
            sx={{
              width: 28,
              height: 28,
              color: node.type === s.type ? COLOR_ICE_BLUE : COLOR_TEXT_SECONDARY,
              backgroundColor: node.type === s.type ? 'rgba(144,202,249,0.12)' : 'transparent',
              borderRadius: '6px',
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.08)',
                color: COLOR_TEXT_PRIMARY,
              },
            }}
          >
            {s.icon}
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  );
}
