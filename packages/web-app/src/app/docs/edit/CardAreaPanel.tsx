'use client';

import {
  Box,
  Card,
  CardContent,
  IconButton,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { useTranslations } from 'next-intl';
import type { LayoutCategory } from '../../../types/layout';

function SortableCategory({
  category,
  onEdit,
  onDelete,
  t,
}: {
  category: LayoutCategory;
  onEdit: (category: LayoutCategory) => void;
  onDelete: (id: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} sx={{ mb: 1 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, '&:last-child': { pb: 1 } }}>
        <IconButton size="small" {...attributes} {...listeners} aria-roledescription="sortable" aria-label={`${category.title || t('sitesCategoryAdd')} - drag to reorder`} sx={{ cursor: 'grab', color: 'text.secondary' }}>
          <DragIndicatorIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {category.title || t('sitesCategoryAdd')}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {category.items.length} {t('sitesCategoryItems')}
          </Typography>
        </Box>
        <IconButton size="small" onClick={() => onEdit(category)} aria-label={t('sitesEdit')}>
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => onDelete(category.id)}
          aria-label={t('sitesCategoryDelete')}
          sx={{ '&:hover': { color: 'error.main' } }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </CardContent>
    </Card>
  );
}

interface CategoryAreaPanelProps {
  categories: LayoutCategory[];
  activeCategory: LayoutCategory | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sensors: ReturnType<typeof import('@dnd-kit/core').useSensors>;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onEdit: (category: LayoutCategory) => void;
  onDelete: (id: string) => void;
  t: ReturnType<typeof useTranslations>;
}

export default function CategoryAreaPanel({
  categories,
  activeCategory,
  sensors,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
  t,
}: CategoryAreaPanelProps) {
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary' }}>
        {t('sitesCategoryArea')}
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
            <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {categories.map((category) => (
                <SortableCategory
                  key={category.id}
                  category={category}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  t={t}
                />
              ))}
            </SortableContext>
            <DragOverlay>
              {activeCategory ? (
                <Card sx={{ opacity: 0.8 }}>
                  <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
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
