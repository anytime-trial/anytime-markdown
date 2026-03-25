'use client';

import React, { useState, useEffect } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { getCanvasColors } from '@anytime-markdown/graph-core';
import { useThemeMode } from '../../providers';

interface DocEditorModalProps {
  open: boolean;
  title: string;
  content: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

export function DocEditorModal({ open, title, content, onSave, onClose }: DocEditorModalProps) {
  const t = useTranslations('Graph');
  const { themeMode } = useThemeMode();
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
      sx={{
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
        sx={{
          m: 'auto',
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
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1,
            borderBottom: `1px solid ${colors.panelBorder}`,
            backgroundColor: colors.panelBg,
          }}
        >
          <Typography variant="subtitle1" sx={{ color: colors.textPrimary, fontWeight: 600 }}>
            {title || t('untitledDocument')}
          </Typography>
          <IconButton size="small" onClick={handleClose} sx={{ color: colors.textSecondary }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Editor */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <Box
            component="textarea"
            value={editorContent}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditorContent(e.target.value)}
            sx={{
              width: '100%',
              height: '100%',
              backgroundColor: colors.modalBg,
              color: colors.textPrimary,
              border: 'none',
              outline: 'none',
              resize: 'none',
              p: 3,
              fontSize: '14px',
              fontFamily: 'Roboto Mono, monospace',
              lineHeight: 1.6,
              '&::placeholder': {
                color: colors.textSecondary,
              },
            }}
            placeholder={t('writePlaceholder')}
          />
        </Box>
      </Box>
    </Box>
  );
}
