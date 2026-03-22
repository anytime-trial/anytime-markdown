'use client';

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from '@anytime-markdown/editor-core';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import LinkIcon from '@mui/icons-material/Link';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Box,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { useTranslations } from 'next-intl';
import { RefObject, useMemo, useState } from 'react';

import type { DocFile } from '../../../types/layout';

interface FileListPanelProps {
  files: DocFile[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteFolderRequest: (folder: string, files: DocFile[]) => void;
  urlLinks: { url: string; displayName: string }[];
  onAddUrlLink: (url: string, displayName: string) => void;
  onDeleteUrlLink: (url: string) => void;
  t: ReturnType<typeof useTranslations>;
}

export default function FileListPanel({
  files,
  fileInputRef,
  onUpload,
  onDeleteFolderRequest,
  urlLinks,
  onAddUrlLink,
  onDeleteUrlLink,
  t,
}: Readonly<FileListPanelProps>) {
  const theme = useTheme();
  const bgColor = theme.palette.mode === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;
  const [urlDraft, setUrlDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');

  // フォルダごとにグルーピング（ルート直下は除外）
  const folderGroups = useMemo(() => {
    const groups = new Map<string, DocFile[]>();
    for (const file of files) {
      const withoutPrefix = file.key.replace(/^docs\//, '');
      const slashIdx = withoutPrefix.indexOf('/');
      const folder = slashIdx >= 0 ? withoutPrefix.slice(0, slashIdx) : '';
      if (!folder) continue; // ルート直下のファイルは除外
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder)!.push(file);
    }
    return groups;
  }, [files]);

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
      {/* @ts-expect-error webkitdirectory is not in React's type definitions */}
      <input ref={fileInputRef} type="file" webkitdirectory="" hidden onChange={onUpload} />
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: bgColor, maxHeight: 400, overflow: 'auto' }}>
        <List dense disablePadding>
          {[...folderGroups.entries()].map(([folder, folderFiles]) => (
            <ListItem
              key={folder}
              draggable
              onDragStart={(e) => {
                const payload = folderFiles.map((f) => ({ key: f.key, name: f.name }));
                e.dataTransfer.setData('application/x-doc-folder', JSON.stringify(payload));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  aria-label={t('docsDelete')}
                  onClick={() => onDeleteFolderRequest(folder, folderFiles)}
                  sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              }
              sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <FolderIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {folder}/
                    </Typography>
                    <FolderLanguageBadges files={folderFiles} />
                  </Box>
                }
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
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: bgColor, maxHeight: 200, overflow: 'auto' }}>
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

function FolderLanguageBadges({ files }: Readonly<{ files: DocFile[] }>) {
  const mdFiles = files.filter((f) => f.name.endsWith('.md'));
  const hasJa = mdFiles.some((f) => !f.name.endsWith('.en.md'));
  const hasEn = mdFiles.some((f) => f.name.endsWith('.en.md'));
  if (!hasJa && !hasEn) return null;
  return (
    <>
      <Chip label="JA" size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700, bgcolor: hasJa ? 'primary.main' : 'action.disabledBackground', color: hasJa ? 'primary.contrastText' : 'text.disabled' }} />
      <Chip label="EN" size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700, bgcolor: hasEn ? 'primary.main' : 'action.disabledBackground', color: hasEn ? 'primary.contrastText' : 'text.disabled' }} />
    </>
  );
}
