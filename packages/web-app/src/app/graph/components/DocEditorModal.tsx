'use client';

import React, { useState, useEffect } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import {
  COLOR_MIDNIGHT_NAVY, COLOR_BORDER, COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY, COLOR_CHARCOAL,
} from '@anytime-markdown/graph-core';

interface DocEditorModalProps {
  open: boolean;
  title: string;
  content: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

export function DocEditorModal({ open, title, content, onSave, onClose }: DocEditorModalProps) {
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
          backgroundColor: COLOR_MIDNIGHT_NAVY,
          border: `1px solid ${COLOR_BORDER}`,
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
            borderBottom: `1px solid ${COLOR_BORDER}`,
            backgroundColor: COLOR_CHARCOAL,
          }}
        >
          <Typography variant="subtitle1" sx={{ color: COLOR_TEXT_PRIMARY, fontWeight: 600 }}>
            {title || 'Untitled Document'}
          </Typography>
          <IconButton size="small" onClick={handleClose} sx={{ color: COLOR_TEXT_SECONDARY }}>
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
              backgroundColor: COLOR_MIDNIGHT_NAVY,
              color: COLOR_TEXT_PRIMARY,
              border: 'none',
              outline: 'none',
              resize: 'none',
              p: 3,
              fontSize: '14px',
              fontFamily: 'Roboto Mono, monospace',
              lineHeight: 1.6,
              '&::placeholder': {
                color: COLOR_TEXT_SECONDARY,
              },
            }}
            placeholder="Write your markdown here..."
          />
        </Box>
      </Box>
    </Box>
  );
}
