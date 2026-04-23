'use client';

import { getCanvasColors } from '@anytime-markdown/graph-core';
import React, { useEffect, useRef } from 'react';

import { worldToScreen } from '@anytime-markdown/graph-core/engine';
import { GraphNode, Viewport } from '../types';

interface TextEditOverlayProps {
  node: GraphNode | null;
  viewport: Viewport;
  onCommit: (id: string, text: string) => void;
  onCancel: () => void;
  /** キー入力で編集開始した場合、既存テキストをクリアして入力開始 */
  appendMode?: boolean;
  themeMode?: 'light' | 'dark';
}

export function TextEditOverlay({ node, viewport, onCommit, onCancel, appendMode, themeMode = 'dark' }: Readonly<TextEditOverlayProps>) {
  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (node && textareaRef.current) {
      if (appendMode) {
        textareaRef.current.value = node.text ?? '';
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      } else {
        textareaRef.current.value = node.text ?? '';
        textareaRef.current.focus();
        textareaRef.current.select();
      }
    }
  }, [node, appendMode]);

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
        border: `2px solid ${colors.accentColor}`,
        borderRadius: 2,
        outline: 'none',
        resize: 'none',
        padding: '4px 8px',
        boxSizing: 'border-box',
        background: 'transparent',
        color: colors.textPrimary,
        zIndex: 30,
        overflow: 'hidden',
      }}
    />
  );
}
