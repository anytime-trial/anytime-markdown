import { useEffect, useRef } from 'react';
import type { GraphNode, Viewport } from '@anytime-markdown/graph-core';
import { worldToScreen } from '@anytime-markdown/graph-core/engine';

interface TextEditOverlayProps {
  node: GraphNode;
  viewport: Viewport;
  onCommit: (text: string) => void;
  onCancel: () => void;
  appendMode?: boolean;
}

export function TextEditOverlay({ node, viewport, onCommit, onCancel, appendMode }: TextEditOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      if (appendMode) {
        inputRef.current.focus();
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      } else {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  }, [appendMode]);

  const pos = worldToScreen(viewport, node.x, node.y);

  return (
    <input
      ref={inputRef}
      defaultValue={node.text}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: node.width * viewport.scale,
        height: node.height * viewport.scale,
        fontSize: node.style.fontSize * viewport.scale,
        fontFamily: node.style.fontFamily,
        textAlign: 'center',
        border: '2px solid var(--vscode-focusBorder)',
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-input-foreground)',
        outline: 'none',
        boxSizing: 'border-box',
        padding: '2px 4px',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(e.currentTarget.value);
        if (e.key === 'Escape') onCancel();
        e.stopPropagation();
      }}
      onBlur={(e) => onCommit(e.currentTarget.value)}
    />
  );
}
