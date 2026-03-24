'use client';

import React, { useEffect, useRef } from 'react';
import { GraphNode, Viewport } from '../types';
import { worldToScreen } from '../engine/viewport';
import { COLOR_ICE_BLUE, COLOR_TEXT_PRIMARY } from '@anytime-markdown/graph-core';

interface TextEditOverlayProps {
  node: GraphNode | null;
  viewport: Viewport;
  onCommit: (id: string, text: string) => void;
  onCancel: () => void;
}

export function TextEditOverlay({ node, viewport, onCommit, onCancel }: TextEditOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (node && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.value = node.text;
      textareaRef.current.select();
    }
  }, [node]);

  if (!node) return null;

  const screen = worldToScreen(viewport, node.x, node.y);
  const w = node.width * viewport.scale;
  const h = node.height * viewport.scale;
  const fontSize = node.style.fontSize * viewport.scale;

  const handleBlur = () => {
    if (textareaRef.current) {
      onCommit(node.id, textareaRef.current.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    e.stopPropagation();
  };

  return (
    <textarea
      ref={textareaRef}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        left: screen.x,
        top: screen.y,
        width: w,
        height: h,
        fontSize,
        fontFamily: node.style.fontFamily,
        textAlign: 'center',
        border: `2px solid ${COLOR_ICE_BLUE}`,
        borderRadius: 2,
        outline: 'none',
        resize: 'none',
        padding: '4px 8px',
        boxSizing: 'border-box',
        background: 'transparent',
        color: COLOR_TEXT_PRIMARY,
        zIndex: 30,
        overflow: 'hidden',
      }}
    />
  );
}
