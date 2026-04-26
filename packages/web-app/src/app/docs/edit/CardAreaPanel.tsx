'use client';

import { ACCENT_COLOR, DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from '@anytime-markdown/markdown-core';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  List,
  ListItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { LayoutCategory } from '../../../types/layout';

const hoverShowSx = {
  opacity: 0,
  transition: 'opacity 0.15s',
  '.category-card:hover &': { opacity: 1 },
} as const;

function getBorderColor(dragOver: boolean, isDark: boolean): string {
  if (dragOver) return ACCENT_COLOR;
  return isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
}

function InlineEditField({
  value,
  placeholder,
  onSave,
  variant,
}: Readonly<{
  value: string;
  placeholder: string;
  onSave: (value: string) => void;
  variant: 'title' | 'description' | 'item';
}>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  const fontSize = variant === 'title' ? '1.25rem' : '0.875rem';
  const fontWeightMap = { title: 700, item: 500, description: 400 } as const;
  const fontWeight = fontWeightMap[variant];

  if (editing) {
    return (
      <TextField
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          }
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        autoFocus
        size="small"
        variant="standard"
        fullWidth
        multiline={variant === 'description'}
        placeholder={placeholder}
        sx={{
          '& .MuiInputBase-input': {
            fontSize,
            fontWeight,
            py: 0,
          },
        }}
      />
    );
  }

  const colorMap = {
    title: value ? 'text.primary' : 'text.disabled',
    description: value ? 'text.secondary' : 'text.disabled',
    item: value ? 'text.primary' : 'text.disabled',
  };

  const handleStartEdit = () => { setDraft(value); setEditing(true); };

  return (
    <Box
      role="button"
      tabIndex={0}
      sx={{ minWidth: 0, cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', borderRadius: 0.5 } }}
      onClick={handleStartEdit}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleStartEdit(); } }}
    >
      {variant === 'title' ? (
        <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 0, color: colorMap.title }} noWrap>
          {value || placeholder}
        </Typography>
      ) : (
        <Typography
          variant="body2"
          sx={{
            minWidth: 0,
            lineHeight: 1.7,
            fontWeight,
            color: colorMap[variant],
          }}
          noWrap={variant === 'item'}
        >
          {value || placeholder}
        </Typography>
      )}
    </Box>
  );
}

function SortableItem({
  item,
  categoryId,
  onRemoveItem,
  onUpdateItemDisplayName,
  t,
}: Readonly<{
  item: { docKey: string; displayName: string };
  categoryId: string;
  onRemoveItem: (categoryId: string, docKey: string) => void;
  onUpdateItemDisplayName: (categoryId: string, docKey: string, displayName: string) => void;
  t: ReturnType<typeof useTranslations>;
}>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.docKey });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      disablePadding
      secondaryAction={
        <Box sx={{ display: 'flex', alignItems: 'center', ...hoverShowSx }}>
          <IconButton
            edge="end"
            size="small"
            onClick={() => onRemoveItem(categoryId, item.docKey)}
            aria-label={t('sitesCategoryRemoveItem')}
            sx={{ '&:hover': { color: 'error.main' } }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      }
    >
      <IconButton
        size="small"
        {...attributes}
        {...listeners}
        sx={{ p: 0, mr: 0.5, cursor: 'grab', ...hoverShowSx }}
      >
        <DragIndicatorIcon sx={{ fontSize: 14 }} />
      </IconButton>
      <Tooltip title={item.docKey} arrow>
        <Box sx={{ borderRadius: 1, py: 0.5, px: 0.5, flex: 1, minWidth: 0 }}>
          <InlineEditField
            value={item.displayName}
            placeholder={t('sitesItemDisplayName')}
            onSave={(v) => onUpdateItemDisplayName(categoryId, item.docKey, v)}
            variant="item"
          />
        </Box>
      </Tooltip>
    </ListItem>
  );
}

function SortableCategory({
  category,
  isDark,
  onDelete,
  onRemoveItem,
  onUpdateField,
  onUpdateItemDisplayName,
  onReorderItems,
  onDropFile,
  onDropUrl,
  t,
}: Readonly<{
  category: LayoutCategory;
  isDark: boolean;
  onDelete: (id: string) => void;
  onRemoveItem: (categoryId: string, docKey: string) => void;
  onUpdateField: (categoryId: string, field: 'title' | 'description', value: string) => void;
  onUpdateItemDisplayName: (categoryId: string, docKey: string, displayName: string) => void;
  onReorderItems: (categoryId: string, oldIndex: number, newIndex: number) => void;
  onDropFile: (categoryId: string, fileKey: string, fileName: string) => void;
  onDropUrl: (categoryId: string, url: string, displayName: string) => void;
  t: ReturnType<typeof useTranslations>;
}>) {
  const [dragOver, setDragOver] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = category.items.findIndex((item) => item.docKey === active.id);
    const newIndex = category.items.findIndex((item) => item.docKey === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderItems(category.id, oldIndex, newIndex);
    }
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box className="category-card" sx={{ position: 'relative', height: '100%' }}>
      <IconButton
        size="small"
        {...attributes}
        {...listeners}
        aria-roledescription="sortable"
        aria-label={`${category.title || t('sitesCategoryAdd')} - drag to reorder`}
        sx={{
          position: 'absolute',
          top: -8,
          left: -8,
          zIndex: 1,
          width: 22,
          height: 22,
          cursor: 'grab',
          bgcolor: isDark ? 'grey.800' : 'grey.200',
          color: 'text.secondary',
          '&:hover': { bgcolor: isDark ? 'grey.700' : 'grey.300' },
          ...hoverShowSx,
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: 14 }} />
      </IconButton>
      <Card
        ref={setNodeRef}
        style={style}
        elevation={0}
        sx={{
          height: '100%',
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          border: 1,
          borderColor: getBorderColor(dragOver, isDark),
          borderRadius: 3,
          outline: dragOver ? '1px solid' : 'none',
          outlineColor: ACCENT_COLOR,
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-doc-file') || e.dataTransfer.types.includes('application/x-doc-folder') || e.dataTransfer.types.includes('application/x-url-link')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false);
          const folderRaw = e.dataTransfer.getData('application/x-doc-folder');
          if (folderRaw) {
            e.preventDefault();
            const droppedFiles = JSON.parse(folderRaw) as { key: string; name: string }[];
            if (droppedFiles.length > 0) {
              // フォルダのトップレベル名を取得し、フォルダ単位で1アイテムとして追加
              const firstKey = droppedFiles[0].key;
              const folderPrefix = firstKey.substring(0, firstKey.lastIndexOf('/') + 1);
              const folderName = folderPrefix.split('/').findLast(Boolean) ?? folderPrefix;
              onDropFile(category.id, folderPrefix, folderName);
            }
            return;
          }
          const fileRaw = e.dataTransfer.getData('application/x-doc-file');
          if (fileRaw) {
            e.preventDefault();
            const { key, name } = JSON.parse(fileRaw) as { key: string; name: string };
            onDropFile(category.id, key, name);
            return;
          }
          const urlRaw = e.dataTransfer.getData('application/x-url-link');
          if (urlRaw) {
            e.preventDefault();
            const { url, displayName } = JSON.parse(urlRaw) as { url: string; displayName: string };
            onDropUrl(category.id, url, displayName);
          }
        }}
      >
        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <InlineEditField
                value={category.title}
                placeholder={t('sitesCategoryTitle')}
                onSave={(v) => onUpdateField(category.id, 'title', v)}
                variant="title"
              />
            </Box>
            <IconButton
              size="small"
              onClick={() => onDelete(category.id)}
              aria-label={t('sitesCategoryDelete')}
              sx={{ p: 0.5, flexShrink: 0, mt: 0.25, color: 'text.disabled', '&:hover': { color: 'error.main' }, ...hoverShowSx }}
            >
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>

          <Box sx={{ mb: category.items.length > 0 ? 2 : 0 }}>
            <InlineEditField
              value={category.description}
              placeholder={t('sitesCategoryDescription')}
              onSave={(v) => onUpdateField(category.id, 'description', v)}
              variant="description"
            />
          </Box>

          {category.items.length > 0 ? (
            <DndContext
              sensors={itemSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleItemDragEnd}
            >
              <SortableContext items={category.items.map((i) => i.docKey)} strategy={verticalListSortingStrategy}>
                <List dense disablePadding>
                  {category.items.map((item) => (
                    <SortableItem
                      key={item.docKey}
                      item={item}
                      categoryId={category.id}
                      onRemoveItem={onRemoveItem}
                      onUpdateItemDisplayName={onUpdateItemDisplayName}
                      t={t}
                    />
                  ))}
                </List>
              </SortableContext>
            </DndContext>
          ) : (
            <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
              {t('sitesCategoryEmpty')}
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

interface CategoryAreaPanelProps {
  categories: LayoutCategory[];
  activeCategory: LayoutCategory | null;
  sensors: ReturnType<typeof import('@dnd-kit/core').useSensors>;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDelete: (id: string) => void;
  onRemoveItem: (categoryId: string, docKey: string) => void;
  onUpdateField: (categoryId: string, field: 'title' | 'description', value: string) => void;
  onUpdateItemDisplayName: (categoryId: string, docKey: string, displayName: string) => void;
  onReorderItems: (categoryId: string, oldIndex: number, newIndex: number) => void;
  onDropFile: (categoryId: string, fileKey: string, fileName: string) => void;
  onDropUrl: (categoryId: string, url: string, displayName: string) => void;
  onAdd: () => void;
  t: ReturnType<typeof useTranslations>;
}

export default function CategoryAreaPanel({
  categories,
  activeCategory,
  sensors,
  onDragStart,
  onDragEnd,
  onDelete,
  onRemoveItem,
  onUpdateField,
  onUpdateItemDisplayName,
  onReorderItems,
  onDropFile,
  onDropUrl,
  onAdd,
  t,
}: Readonly<CategoryAreaPanelProps>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={{ flex: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          {t('sitesCategoryArea')}
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={onAdd}
          sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
        >
          {t('sitesCategoryAdd')}
        </Button>
      </Box>
      <Box
        sx={{
          border: 2,
          borderColor: 'divider',
          borderStyle: 'dashed',
          borderRadius: 2,
          p: 2,
          minHeight: 200,
          bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
        }}
      >
        {categories.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            {t('sitesEmpty')}
          </Typography>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={categories.map((c) => c.id)} strategy={rectSortingStrategy}>
              <Grid container spacing={3}>
                {categories.map((category) => (
                  <Grid key={category.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <SortableCategory
                      category={category}
                      isDark={isDark}
                      onDelete={onDelete}
                      onRemoveItem={onRemoveItem}
                      onUpdateField={onUpdateField}
                      onUpdateItemDisplayName={onUpdateItemDisplayName}
                      onReorderItems={onReorderItems}
                      onDropFile={onDropFile}
                      onDropUrl={onDropUrl}
                      t={t}
                    />
                  </Grid>
                ))}
              </Grid>
            </SortableContext>
            <DragOverlay>
              {activeCategory ? (
                <Card
                  elevation={0}
                  sx={{
                    opacity: 0.9,
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    border: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    borderRadius: 3,
                  }}
                >
                  <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {activeCategory.title}
                    </Typography>
                  </CardContent>
                </Card>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </Box>
    </Box>
  );
}
