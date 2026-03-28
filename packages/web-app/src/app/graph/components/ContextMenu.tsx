'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import {
  ContentCopy as CopyIcon,
  ContentPaste as PasteIcon,
  Delete as DeleteIcon,
  FlipToFront as FrontIcon,
  FlipToBack as BackIcon,
  GroupWork as GroupIcon,
  Deblur as UngroupIcon,
  SelectAll as SelectAllIcon,
} from '@mui/icons-material';

export type ContextTarget = 'node' | 'edge' | 'canvas';

interface ContextMenuProps {
  anchorPosition: { top: number; left: number } | null;
  targetType: ContextTarget;
  onAction: (action: string) => void;
  onClose: () => void;
  hasClipboard: boolean;
}

export function ContextMenu({ anchorPosition, targetType, onAction, onClose, hasClipboard }: Readonly<ContextMenuProps>) {
  const t = useTranslations('Graph');
  if (!anchorPosition) return null;

  const handleAction = (action: string) => {
    onAction(action);
    onClose();
  };

  return (
    <Menu
      open={true}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
    >
      {targetType === 'node' && [
        <MenuItem key="copy" onClick={() => handleAction('copy')}>
          <ListItemIcon><CopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('copy')}</ListItemText>
        </MenuItem>,
        <MenuItem key="paste" onClick={() => handleAction('paste')} disabled={!hasClipboard}>
          <ListItemIcon><PasteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('paste')}</ListItemText>
        </MenuItem>,
        <MenuItem key="delete" onClick={() => handleAction('delete')}>
          <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('delete')}</ListItemText>
        </MenuItem>,
        <Divider key="d1" />,
        <MenuItem key="front" onClick={() => handleAction('bringToFront')}>
          <ListItemIcon><FrontIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('bringToFront')}</ListItemText>
        </MenuItem>,
        <MenuItem key="back" onClick={() => handleAction('sendToBack')}>
          <ListItemIcon><BackIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('sendToBack')}</ListItemText>
        </MenuItem>,
        <Divider key="d2" />,
        <MenuItem key="group" onClick={() => handleAction('group')}>
          <ListItemIcon><GroupIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('group')}</ListItemText>
        </MenuItem>,
        <MenuItem key="ungroup" onClick={() => handleAction('ungroup')}>
          <ListItemIcon><UngroupIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('ungroup')}</ListItemText>
        </MenuItem>,
      ]}
      {targetType === 'edge' && (
        <MenuItem onClick={() => handleAction('delete')}>
          <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('delete')}</ListItemText>
        </MenuItem>
      )}
      {targetType === 'canvas' && [
        <MenuItem key="paste" onClick={() => handleAction('paste')} disabled={!hasClipboard}>
          <ListItemIcon><PasteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('paste')}</ListItemText>
        </MenuItem>,
        <MenuItem key="selectAll" onClick={() => handleAction('selectAll')}>
          <ListItemIcon><SelectAllIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('selectAll')}</ListItemText>
        </MenuItem>,
      ]}
    </Menu>
  );
}
