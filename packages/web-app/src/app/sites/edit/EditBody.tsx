'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DescriptionIcon from '@mui/icons-material/Description';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import LandingHeader from '../../components/LandingHeader';
import SiteFooter from '../../components/SiteFooter';

interface DocFile {
  key: string;
  name: string;
  lastModified: string;
  size: number;
}

interface LayoutCard {
  id: string;
  docKey: string;
  title: string;
  description: string;
  thumbnail: string;
  order: number;
}

function generateId() {
  return crypto.randomUUID();
}

function SortableCard({
  card,
  onEdit,
  onDelete,
  t,
}: {
  card: LayoutCard;
  onEdit: (card: LayoutCard) => void;
  onDelete: (id: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} sx={{ mb: 1 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, '&:last-child': { pb: 1 } }}>
        <IconButton size="small" {...attributes} {...listeners} sx={{ cursor: 'grab', color: 'text.secondary' }}>
          <DragIndicatorIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {card.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {card.docKey}
          </Typography>
        </Box>
        <IconButton size="small" onClick={() => onEdit(card)} aria-label={t('sitesEdit')}>
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => onDelete(card.id)}
          aria-label={t('sitesCardDelete')}
          sx={{ '&:hover': { color: 'error.main' } }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </CardContent>
    </Card>
  );
}

export default function EditBody() {
  const t = useTranslations('Landing');
  const tCommon = useTranslations('Common');
  const [files, setFiles] = useState<DocFile[]>([]);
  const [cards, setCards] = useState<LayoutCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [editCard, setEditCard] = useState<LayoutCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocFile | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFormRef = useRef<{ title: string; description: string; thumbnail: string }>({
    title: '',
    description: '',
    thumbnail: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const fetchFiles = useCallback(() => {
    return fetch('/api/docs')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ files: DocFile[] }>;
      })
      .then((data) => setFiles(data.files));
  }, []);

  // ファイル一覧とレイアウトを並行取得
  useEffect(() => {
    Promise.all([
      fetchFiles(),
      fetch('/api/sites/layout').then((r) => r.json()) as Promise<{ cards: LayoutCard[] }>,
    ])
      .then(([, layoutData]) => {
        setCards(layoutData.cards.sort((a, b) => a.order - b.order));
      })
      .catch(() => setSnackbar({ message: t('sitesLoadError'), severity: 'error' }))
      .finally(() => setLoading(false));
  }, [t, fetchFiles]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/docs/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSnackbar({ message: t('docsUploadSuccess'), severity: 'success' });
      fetchFiles();
    } catch {
      setSnackbar({ message: t('docsUploadError'), severity: 'error' });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [t, fetchFiles]);

  const handleDeleteFile = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      const res = await fetch(`/api/docs/delete?key=${encodeURIComponent(deleteTarget.key)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSnackbar({ message: t('docsDeleteSuccess'), severity: 'success' });
      // カード一覧からも該当ファイルを除去
      setCards((prev) => prev.filter((c) => c.docKey !== deleteTarget.key));
      fetchFiles();
    } catch {
      setSnackbar({ message: t('docsDeleteError'), severity: 'error' });
    }

    setDeleteTarget(null);
  }, [deleteTarget, t, fetchFiles]);

  const handleAddCard = useCallback((file: DocFile) => {
    setCards((prev) => {
      // 同じファイルが既に追加されている場合はスキップ
      if (prev.some((c) => c.docKey === file.key)) return prev;
      return [
        ...prev,
        {
          id: generateId(),
          docKey: file.key,
          title: file.name.replace(/\.md$/, ''),
          description: '',
          thumbnail: '',
          order: prev.length,
        },
      ];
    });
  }, []);

  const handleDeleteCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setCards((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((c, i) => ({ ...c, order: i }));
    });
  }, []);

  const handleEditOpen = useCallback((card: LayoutCard) => {
    setEditCard(card);
    editFormRef.current = {
      title: card.title,
      description: card.description,
      thumbnail: card.thumbnail,
    };
  }, []);

  const handleEditSave = useCallback(() => {
    if (!editCard) return;
    setCards((prev) =>
      prev.map((c) =>
        c.id === editCard.id
          ? { ...c, title: editFormRef.current.title, description: editFormRef.current.description, thumbnail: editFormRef.current.thumbnail }
          : c,
      ),
    );
    setEditCard(null);
  }, [editCard]);

  const handleSave = useCallback(async () => {
    const layout = { cards: cards.map((c, i) => ({ ...c, order: i })) };

    try {
      const res = await fetch('/api/sites/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSnackbar({ message: t('sitesSaveSuccess'), severity: 'success' });
    } catch {
      setSnackbar({ message: t('sitesSaveError'), severity: 'error' });
    }
  }, [cards, t]);

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <LandingHeader />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <CircularProgress />
        </Box>
        <SiteFooter />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LandingHeader />
      <Container maxWidth="lg" sx={{ flex: 1, py: 4, px: { xs: 2, md: 4 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 700,
              color: 'text.primary',
              fontSize: { xs: '1.8rem', md: '2.4rem' },
            }}
          >
            {t('sitesEdit')}
          </Typography>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              bgcolor: 'secondary.main',
              color: '#1a1a1a',
              '&:hover': { bgcolor: 'secondary.dark' },
            }}
          >
            {t('sitesSave')}
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* 左パネル: ファイル一覧 */}
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
            <input ref={fileInputRef} type="file" accept=".md" hidden onChange={handleUpload} />
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', maxHeight: 400, overflow: 'auto' }}>
              <List dense disablePadding>
                {files.map((file) => {
                  const alreadyAdded = cards.some((c) => c.docKey === file.key);
                  return (
                    <ListItem
                      key={file.key}
                      disablePadding
                      secondaryAction={
                        <IconButton
                          edge="end"
                          size="small"
                          aria-label={t('docsDelete')}
                          onClick={() => setDeleteTarget(file)}
                          sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      }
                    >
                      <ListItemButton
                        onClick={() => handleAddCard(file)}
                        disabled={alreadyAdded}
                        sx={{ opacity: alreadyAdded ? 0.5 : 1 }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <DescriptionIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={file.name}
                          primaryTypographyProps={{ fontSize: '0.85rem', noWrap: true }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </Box>
          </Box>

          {/* 右パネル: カード配置エリア */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary' }}>
              {t('sitesCardArea')}
            </Typography>
            <Box
              sx={{
                border: 2,
                borderColor: 'divider',
                borderStyle: 'dashed',
                borderRadius: 2,
                p: 2,
                minHeight: 200,
                bgcolor: 'background.paper',
              }}
            >
              {cards.length === 0 ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  {t('sitesEmpty')}
                </Typography>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {cards.map((card) => (
                      <SortableCard
                        key={card.id}
                        card={card}
                        onEdit={handleEditOpen}
                        onDelete={handleDeleteCard}
                        t={t}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay>
                    {activeCard ? (
                      <Card sx={{ opacity: 0.8 }}>
                        <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {activeCard.title}
                          </Typography>
                        </CardContent>
                      </Card>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}
            </Box>
          </Box>
        </Box>
      </Container>
      <SiteFooter />

      {/* ファイル削除確認ダイアログ */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('docsDelete')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('docsDeleteConfirm')}
            {deleteTarget && (
              <Box component="span" sx={{ display: 'block', mt: 1, fontWeight: 600 }}>
                {deleteTarget.name}
              </Box>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{tCommon('cancel')}</Button>
          <Button onClick={handleDeleteFile} color="error" variant="contained">
            {t('docsDelete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* カード編集ダイアログ */}
      <Dialog open={!!editCard} onClose={() => setEditCard(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('sitesEdit')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label={t('sitesCardTitle')}
            defaultValue={editCard?.title ?? ''}
            onChange={(e) => { editFormRef.current.title = e.target.value; }}
            fullWidth
            size="small"
          />
          <TextField
            label={t('sitesCardDescription')}
            defaultValue={editCard?.description ?? ''}
            onChange={(e) => { editFormRef.current.description = e.target.value; }}
            fullWidth
            size="small"
            multiline
            rows={3}
          />
          <TextField
            label={t('sitesCardThumbnail')}
            defaultValue={editCard?.thumbnail ?? ''}
            onChange={(e) => { editFormRef.current.thumbnail = e.target.value; }}
            fullWidth
            size="small"
            placeholder="https://..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCard(null)}>{tCommon('cancel')}</Button>
          <Button onClick={handleEditSave} variant="contained">{tCommon('ok')}</Button>
        </DialogActions>
      </Dialog>

      {/* スナックバー */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)} variant="filled">
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
