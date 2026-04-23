'use client';

import { getCanvasColors } from '@anytime-markdown/graph-core';
import {
  CircleOutlined as EllipseIcon,
  CropSquare as RectIcon,
} from '@mui/icons-material';
import { Box, IconButton, Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import React from 'react';

import { worldToScreen } from '@anytime-markdown/graph-core/engine';
import { GraphNode, NodeType, Viewport } from '../types';
import {
  CylinderShapeIcon as CylinderIcon,
  DiamondShapeIcon as DiamondIcon,
  ParallelogramShapeIcon as ParallelogramIcon,
} from './ShapeIcons';

const SHAPES: { type: NodeType; icon: React.ReactNode; i18nKey: string }[] = [
  { type: 'rect', icon: <RectIcon sx={{ fontSize: 18 }} />, i18nKey: 'rect' },
  { type: 'ellipse', icon: <EllipseIcon sx={{ fontSize: 18 }} />, i18nKey: 'ellipse' },
  { type: 'diamond', icon: <DiamondIcon sx={{ fontSize: 18 }} />, i18nKey: 'diamond' },
  { type: 'parallelogram', icon: <ParallelogramIcon sx={{ fontSize: 18 }} />, i18nKey: 'parallelogram' },
  { type: 'cylinder', icon: <CylinderIcon sx={{ fontSize: 18 }} />, i18nKey: 'cylinder' },
];

interface ShapeHoverBarProps {
  node: GraphNode;
  viewport: Viewport;
  onChangeType: (id: string, type: NodeType) => void;
  themeMode?: 'light' | 'dark';
}

const SHAPE_TYPES = new Set(SHAPES.map(s => s.type));

export function ShapeHoverBar({ node, viewport, onChangeType, themeMode = 'dark' }: Readonly<ShapeHoverBarProps>) {
  const t = useTranslations('Graph');
  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);

  // 基本図形以外はホバーバーを表示しない
  if (!SHAPE_TYPES.has(node.type)) return null;

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
        backgroundColor: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
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
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none',
          opacity: 1,
        },
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {SHAPES.map(s => (
        <Tooltip key={s.type} title={t(s.i18nKey)} placement="top">
          <IconButton
            size="small"
            onClick={() => onChangeType(node.id, s.type)}
            sx={{
              width: 28,
              height: 28,
              color: node.type === s.type ? colors.accentColor : colors.textSecondary,
              backgroundColor: node.type === s.type ? `${colors.accentColor}1F` : 'transparent',
              borderRadius: '6px',
              '&:hover': {
                backgroundColor: colors.hoverBg,
                color: colors.textPrimary,
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
