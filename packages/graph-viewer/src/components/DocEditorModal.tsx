'use client';

import { getCanvasColors } from '@anytime-markdown/graph-core';
import { Box, CloseIcon, IconButton, Text } from '../ui';
import { useGraphT } from '../i18n/context';
import React, { useEffect,useState } from 'react';

interface DocEditorModalProps {
  open: boolean;
  title: string;
  content: string;
  onSave: (content: string) => void;
  onClose: () => void;
  themeMode?: 'light' | 'dark';
}

export function DocEditorModal({ open, title, content, onSave, onClose, themeMode = 'dark' }: Readonly<DocEditorModalProps>) {
  const t = useGraphT('Graph');
  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);
  const [editorContent, setEditorContent] = useState(content);

  useEffect(() => {
    if (open) setEditorContent(content);
  }, [open, content]);

  if (!open) return null;

  const handleClose = () => {
    onSave(editorContent);
    onClose();
  };

  return (
    <Box
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <Box
        style={{
          margin: 'auto',
          width: '90vw',
          maxWidth: 1000,
          height: '85vh',
          backgroundColor: colors.modalBg,
          border: `1px solid ${colors.panelBorder}`,
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            borderBottom: `1px solid ${colors.panelBorder}`,
            backgroundColor: colors.panelBg,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: 600, fontSize: '1rem' }}>
            {title || t('untitledDocument')}
          </Text>
          <IconButton size="small" onClick={handleClose} style={{ color: colors.textSecondary }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Editor */}
        <Box style={{ flex: 1, overflow: 'hidden' }}>
          <textarea
            className="gv-doc-textarea"
            value={editorContent}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditorContent(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              backgroundColor: colors.modalBg,
              color: colors.textPrimary,
              border: 'none',
              outline: 'none',
              resize: 'none',
              padding: 24,
              fontSize: '14px',
              fontFamily: 'Roboto Mono, monospace',
              lineHeight: 1.6,
            }}
            placeholder={t('writePlaceholder')}
          />
        </Box>
      </Box>
    </Box>
  );
}
