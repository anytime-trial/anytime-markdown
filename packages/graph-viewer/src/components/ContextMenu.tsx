'use client';

import {
  ContentCopy as CopyIcon,
  ContentPaste as PasteIcon,
  Deblur as UngroupIcon,
  Delete as DeleteIcon,
  FlipToBack as BackIcon,
  FlipToFront as FrontIcon,
  GroupWork as GroupIcon,
  SelectAll as SelectAllIcon,
} from '@mui/icons-material';
import { Divider,ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { useTranslations } from 'next-intl';
import React from 'react';

export type ContextTarget = 'node' | 'edge' | 'canvas';
export type ContextMenuAction =
  | 'copy' | 'paste' | 'delete'
  | 'bringToFront' | 'sendToBack'
  | 'group' | 'ungroup'
  | 'selectAll';

interface ContextMenuProps {
  anchorPosition: { top: number; left: number } | null;
  targetType: ContextTarget;
  onAction: (action: ContextMenuAction) => void;
  onClose: () => void;
  hasClipboard: boolean;
}

export function ContextMenu({ anchorPosition, targetType, onAction, onClose, hasClipboard }: Readonly<ContextMenuProps>) {
  const t = useTranslations('Graph');
  if (!anchorPosition) return null;

  const handleAction = (action: ContextMenuAction) => {
    onAction(action);
    onClose();
  };

  const menuItems: React.ReactNode[] = [];

  if (targetType === 'node') {
    menuItems.push(
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
    );
  } else if (targetType === 'edge') {
    menuItems.push(
      <MenuItem key="delete" onClick={() => handleAction('delete')}>
        <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t('delete')}</ListItemText>
      </MenuItem>,
    );
  } else if (targetType === 'canvas') {
    menuItems.push(
      <MenuItem key="paste" onClick={() => handleAction('paste')} disabled={!hasClipboard}>
        <ListItemIcon><PasteIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t('paste')}</ListItemText>
      </MenuItem>,
      <MenuItem key="selectAll" onClick={() => handleAction('selectAll')}>
        <ListItemIcon><SelectAllIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t('selectAll')}</ListItemText>
      </MenuItem>,
    );
  }

  return (
    <Menu
      open={true}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
    >
      {menuItems}
    </Menu>
  );
}
