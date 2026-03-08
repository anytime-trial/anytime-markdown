'use client';

import { RefObject, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import LinkIcon from '@mui/icons-material/Link';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import type { useTranslations } from 'next-intl';
import type { DocFile } from '../../../types/layout';

interface FileListPanelProps {
  files: DocFile[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteRequest: (file: DocFile) => void;
  urlLinks: { url: string; displayName: string }[];
  onAddUrlLink: (url: string, displayName: string) => void;
  onDeleteUrlLink: (url: string) => void;
  t: ReturnType<typeof useTranslations>;
}

export default function FileListPanel({
  files,
  fileInputRef,
  onUpload,
  onDeleteRequest,
  urlLinks,
  onAddUrlLink,
  onDeleteUrlLink,
  t,
}: FileListPanelProps) {
  const [urlDraft, setUrlDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');

  const handleAdd = () => {
    const trimmedUrl = urlDraft.trim();
    const trimmedName = nameDraft.trim() || trimmedUrl;
    if (!trimmedUrl) return;
    if (!trimmedUrl.startsWith('/') && !trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) return;
    onAddUrlLink(trimmedUrl, trimmedName);
    setUrlDraft('');
    setNameDraft('');
  };

  return (
    <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          {t('sitesFileList')}
        </Typography>
        <Button
          size="small"
          startIcon={<UploadFileIcon />}
          onClick={() => fileInputRef.current?.click()}
          sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
        >
          {t('docsUpload')}
        </Button>
      </Box>
      <input ref={fileInputRef} type="file" accept=".md" multiple hidden onChange={onUpload} />
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', maxHeight: 400, overflow: 'auto' }}>
        <List dense disablePadding>
          {files.map((file) => (
            <ListItem
              key={file.key}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-doc-file', JSON.stringify({ key: file.key, name: file.name }));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  aria-label={t('docsDelete')}
                  onClick={() => onDeleteRequest(file)}
                  sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              }
              sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <DescriptionIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </ListItemIcon>
              <ListItemText
                primary={file.name}
                primaryTypographyProps={{ fontSize: '0.85rem', noWrap: true }}
              />
            </ListItem>
          ))}
        </List>
      </Box>

      {/* URLリンク */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mt: 3, mb: 1 }}>
        {t('sitesUrlLinks')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
        <TextField
          size="small"
          placeholder={t('sitesUrlPlaceholder')}
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          fullWidth
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            placeholder={t('sitesUrlDisplayName')}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            fullWidth
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            disabled={!urlDraft.trim()}
            sx={{ textTransform: 'none', fontWeight: 600, flexShrink: 0 }}
          >
            {t('sitesUrlAdd')}
          </Button>
        </Box>
      </Box>
      {urlLinks.length > 0 && (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', maxHeight: 200, overflow: 'auto' }}>
          <List dense disablePadding>
            {urlLinks.map((link) => (
              <ListItem
                key={link.url}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-url-link', JSON.stringify({ url: link.url, displayName: link.displayName }));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    aria-label={t('docsDelete')}
                    onClick={() => onDeleteUrlLink(link.url)}
                    sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
                sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <LinkIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </ListItemIcon>
                <ListItemText
                  primary={link.displayName}
                  secondary={link.url}
                  primaryTypographyProps={{ fontSize: '0.85rem', noWrap: true }}
                  secondaryTypographyProps={{ fontSize: '0.7rem', noWrap: true }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
}
