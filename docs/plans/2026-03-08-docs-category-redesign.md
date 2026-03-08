# /docs ページ GitHub Docs 風カテゴリリデザイン 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `/docs` ページをカード単位からカテゴリ単位に変更し、各カテゴリ内にドキュメントリンク一覧を表示する GitHub Docs 風レイアウトにする。

**Architecture:** `LayoutCard`（1カード=1ドキュメント）を `LayoutCategory`（1カテゴリ=複数ドキュメント）に置換。スキーマ変更 → s3Client → API → 編集UI → 表示UI の順で変更。既存データとの後方互換性は不要（編集画面で再設定する運用）。

**Tech Stack:** Next.js (App Router), MUI, @dnd-kit, Zod, next-intl, S3

---

### Task 1: スキーマ変更（layout.ts）

**Files:**
- Modify: `packages/web-app/src/types/layout.ts`

**Step 1: スキーマを書き換える**

`layoutCardSchema` を削除し、以下に置き換える:

```ts
import { z } from 'zod';

export const layoutCategoryItemSchema = z.object({
  docKey: z.string().max(500),
  displayName: z.string().max(200),
});

export const layoutCategorySchema = z.object({
  id: z.string().max(100),
  title: z.string().max(200),
  description: z.string().max(1000),
  items: z.array(layoutCategoryItemSchema).max(50),
  order: z.number().int().min(0),
});

export const layoutDataSchema = z.object({
  categories: z.array(layoutCategorySchema).max(100),
  siteDescription: z.string().max(500).optional(),
});

export type LayoutCategoryItem = z.infer<typeof layoutCategoryItemSchema>;
export type LayoutCategory = z.infer<typeof layoutCategorySchema>;
export type LayoutData = z.infer<typeof layoutDataSchema>;

export interface DocFile {
  key: string;
  name: string;
  lastModified: string;
  size: number;
}
```

**Step 2: コミット**

```bash
git add packages/web-app/src/types/layout.ts
git commit -m "refactor: LayoutCard を LayoutCategory に変更"
```

---

### Task 2: s3Client 更新

**Files:**
- Modify: `packages/web-app/src/lib/s3Client.ts`

**Step 1: fetchLayoutData を categories ベースに変更**

```ts
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import type { LayoutData } from '../types/layout';

export const s3Client = new S3Client({
  region: process.env.ANYTIME_AWS_REGION ?? 'ap-northeast-1',
});

export const DOCS_BUCKET = process.env.S3_DOCS_BUCKET ?? '';
export const DOCS_PREFIX = process.env.S3_DOCS_PREFIX ?? 'docs/';

const LAYOUT_KEY = DOCS_PREFIX + '_layout.json';

export async function fetchLayoutData(): Promise<LayoutData> {
  if (!DOCS_BUCKET) {
    return { categories: [] };
  }

  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: DOCS_BUCKET, Key: LAYOUT_KEY }),
    );
    const body = await response.Body?.transformToString('utf-8');
    if (!body) return { categories: [] };

    const data = JSON.parse(body) as LayoutData;
    return {
      categories: (data.categories ?? []).sort((a, b) => a.order - b.order),
      siteDescription: data.siteDescription,
    };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'NoSuchKey') {
      return { categories: [] };
    }
    throw e;
  }
}
```

**Step 2: コミット**

```bash
git add packages/web-app/src/lib/s3Client.ts
git commit -m "refactor: s3Client を categories ベースに変更"
```

---

### Task 3: i18n キー更新

**Files:**
- Modify: `packages/editor-core/src/i18n/ja.json`
- Modify: `packages/editor-core/src/i18n/en.json`

**Step 1: Landing セクションのキーを更新**

不要キーの削除: `sitesCardThumbnail`, `sitesCardTags`, `sitesFilterAll`
キー名変更: `sitesCardArea` → `sitesCategoryArea`, `sitesCardTitle` → `sitesCategoryTitle`, `sitesCardDescription` → `sitesCategoryDescription`, `sitesCardDelete` → `sitesCategoryDelete`
新規追加: `sitesCategoryAdd`, `sitesCategoryItems`, `sitesCategoryAddItem`, `sitesCategoryRemoveItem`, `sitesCategoryEmpty`, `sitesItemDisplayName`

**ja.json 変更後（Landing セクション該当部分）:**

```json
"sitesPage": "ドキュメント",
"sitesEdit": "レイアウト編集",
"sitesCategoryArea": "カテゴリ配置エリア",
"sitesSave": "保存",
"sitesSaveSuccess": "レイアウトを保存しました",
"sitesSaveError": "レイアウトの保存に失敗しました",
"sitesLoadError": "レイアウトの読み込みに失敗しました",
"sitesCategoryTitle": "カテゴリ名",
"sitesCategoryDescription": "説明文",
"sitesEmpty": "カテゴリがありません",
"sitesCategoryDelete": "カテゴリを削除",
"sitesCategoryAdd": "カテゴリを追加",
"sitesCategoryItems": "ドキュメント一覧",
"sitesCategoryAddItem": "ドキュメントを追加",
"sitesCategoryRemoveItem": "ドキュメントを削除",
"sitesCategoryEmpty": "ドキュメントがありません",
"sitesItemDisplayName": "表示名",
"siteDescription": "サイトの説明",
```

**en.json 変更後（対応部分）:**

```json
"sitesPage": "Documents",
"sitesEdit": "Edit Layout",
"sitesCategoryArea": "Category Area",
"sitesSave": "Save",
"sitesSaveSuccess": "Layout saved",
"sitesSaveError": "Failed to save layout",
"sitesLoadError": "Failed to load layout",
"sitesCategoryTitle": "Category name",
"sitesCategoryDescription": "Description",
"sitesEmpty": "No categories",
"sitesCategoryDelete": "Delete category",
"sitesCategoryAdd": "Add category",
"sitesCategoryItems": "Documents",
"sitesCategoryAddItem": "Add document",
"sitesCategoryRemoveItem": "Remove document",
"sitesCategoryEmpty": "No documents",
"sitesItemDisplayName": "Display name",
"siteDescription": "Site description",
```

**Step 2: コミット**

```bash
git add packages/editor-core/src/i18n/ja.json packages/editor-core/src/i18n/en.json
git commit -m "refactor: i18n キーをカテゴリベースに変更"
```

---

### Task 4: useLayoutEditor 書き換え

**Files:**
- Modify: `packages/web-app/src/app/docs/edit/useLayoutEditor.ts`

**Step 1: cards state を categories state に変更**

主な変更点:
- `cards` → `categories` (state名)
- `LayoutCard` → `LayoutCategory` (型)
- `handleAddCard` → `handleAddCategory`（新規カテゴリ作成、空のitemsで）
- `handleDeleteCard` → `handleDeleteCategory`
- `editCard` → `editCategory`
- `editFormRef` から `thumbnail`, `tags` を削除
- カテゴリ編集ダイアログでの items 管理（追加・削除）用の state と handler を追加
- `handleSave` で `{ categories: ..., siteDescription }` を送信

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { useTranslations } from 'next-intl';
import type { DocFile, LayoutCategory, LayoutCategoryItem } from '../../../types/layout';

function generateId() {
  return crypto.randomUUID();
}

export function useLayoutEditor() {
  const t = useTranslations('Landing');
  const tCommon = useTranslations('Common');
  const [files, setFiles] = useState<DocFile[]>([]);
  const [categories, setCategories] = useState<LayoutCategory[]>([]);
  const [siteDescription, setSiteDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [editCategory, setEditCategory] = useState<LayoutCategory | null>(null);
  const [editItems, setEditItems] = useState<LayoutCategoryItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DocFile | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFormRef = useRef<{ title: string; description: string }>({
    title: '',
    description: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchFiles = useCallback(() => {
    return fetch('/api/docs')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ files: DocFile[] }>;
      })
      .then((data) => setFiles(data.files));
  }, []);

  useEffect(() => {
    Promise.all([
      fetchFiles(),
      fetch('/api/sites/layout').then((r) => r.json()) as Promise<{ categories: LayoutCategory[]; siteDescription?: string }>,
    ])
      .then(([, layoutData]) => {
        setCategories(
          (layoutData.categories ?? [])
            .map((c) => ({ ...c, items: c.items ?? [] }))
            .sort((a, b) => a.order - b.order),
        );
        if (layoutData.siteDescription) setSiteDescription(layoutData.siteDescription);
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
      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          items: cat.items.filter((item) => item.docKey !== deleteTarget.key),
        })),
      );
      fetchFiles();
    } catch {
      setSnackbar({ message: t('docsDeleteError'), severity: 'error' });
    }

    setDeleteTarget(null);
  }, [deleteTarget, t, fetchFiles]);

  const handleAddCategory = useCallback(() => {
    setCategories((prev) => [
      ...prev,
      {
        id: generateId(),
        title: '',
        description: '',
        items: [],
        order: prev.length,
      },
    ]);
  }, []);

  const handleDeleteCategory = useCallback((id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setCategories((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((c, i) => ({ ...c, order: i }));
    });
  }, []);

  const handleEditOpen = useCallback((category: LayoutCategory) => {
    setEditCategory(category);
    setEditItems([...category.items]);
    editFormRef.current = {
      title: category.title,
      description: category.description,
    };
  }, []);

  const handleEditAddItem = useCallback((file: DocFile) => {
    setEditItems((prev) => {
      if (prev.some((item) => item.docKey === file.key)) return prev;
      return [...prev, { docKey: file.key, displayName: file.name.replace(/\.md$/, '') }];
    });
  }, []);

  const handleEditRemoveItem = useCallback((docKey: string) => {
    setEditItems((prev) => prev.filter((item) => item.docKey !== docKey));
  }, []);

  const handleEditItemDisplayName = useCallback((docKey: string, displayName: string) => {
    setEditItems((prev) =>
      prev.map((item) => (item.docKey === docKey ? { ...item, displayName } : item)),
    );
  }, []);

  const handleEditSave = useCallback(() => {
    if (!editCategory) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === editCategory.id
          ? {
              ...c,
              title: editFormRef.current.title,
              description: editFormRef.current.description,
              items: editItems,
            }
          : c,
      ),
    );
    setEditCategory(null);
    setEditItems([]);
  }, [editCategory, editItems]);

  const handleSave = useCallback(async () => {
    const layout = { categories: categories.map((c, i) => ({ ...c, order: i })), siteDescription };

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
  }, [categories, siteDescription, t]);

  const activeCategory = activeId ? categories.find((c) => c.id === activeId) ?? null : null;

  return {
    t,
    tCommon,
    files,
    categories,
    siteDescription,
    setSiteDescription,
    loading,
    snackbar,
    setSnackbar,
    editCategory,
    setEditCategory,
    editItems,
    editFormRef,
    deleteTarget,
    setDeleteTarget,
    fileInputRef,
    sensors,
    activeCategory,
    handleUpload,
    handleDeleteFile,
    handleAddCategory,
    handleDeleteCategory,
    handleDragStart,
    handleDragEnd,
    handleEditOpen,
    handleEditAddItem,
    handleEditRemoveItem,
    handleEditItemDisplayName,
    handleEditSave,
    handleSave,
  };
}
```

**Step 2: コミット**

```bash
git add packages/web-app/src/app/docs/edit/useLayoutEditor.ts
git commit -m "refactor: useLayoutEditor をカテゴリベースに書き換え"
```

---

### Task 5: CardAreaPanel → CategoryAreaPanel に書き換え

**Files:**
- Modify: `packages/web-app/src/app/docs/edit/CardAreaPanel.tsx`

**Step 1: LayoutCard → LayoutCategory に変更**

コンポーネント名とプロップス型を変更。カテゴリ表示ではタイトルと items 数を表示。

```tsx
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
  type SensorDescriptor,
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
```

**Step 2: コミット**

```bash
git add packages/web-app/src/app/docs/edit/CardAreaPanel.tsx
git commit -m "refactor: CardAreaPanel を CategoryAreaPanel に書き換え"
```

---

### Task 6: EditBody 書き換え

**Files:**
- Modify: `packages/web-app/src/app/docs/edit/EditBody.tsx`

**Step 1: カテゴリ編集UIに変更**

主な変更点:
- `cards` → `categories` を使用
- カテゴリ追加ボタンを追加（ファイル一覧からの追加ではなく、空カテゴリを新規作成）
- 編集ダイアログ: タイトル、説明文、ドキュメントリスト管理（追加・削除・表示名変更）
- サムネイル・タグフィールドを削除
- ファイル一覧パネルはアップロード・削除用に残す（カテゴリへの追加は編集ダイアログ内で行う）
- FileListPanel の `onAddCard` prop は不要になるため、FileListPanel の props も調整

```tsx
'use client';

import {
  Alert,
  Box,
  Button,
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
  ListItemText,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import LandingHeader from '../../components/LandingHeader';
import SiteFooter from '../../components/SiteFooter';
import FileListPanel from './FileListPanel';
import CategoryAreaPanel from './CardAreaPanel';
import { useLayoutEditor } from './useLayoutEditor';

export default function EditBody() {
  const editor = useLayoutEditor();
  const {
    t,
    tCommon,
    files,
    categories,
    siteDescription,
    setSiteDescription,
    loading,
    snackbar,
    setSnackbar,
    editCategory,
    setEditCategory,
    editItems,
    editFormRef,
    deleteTarget,
    setDeleteTarget,
    fileInputRef,
    sensors,
    activeCategory,
    handleUpload,
    handleDeleteFile,
    handleAddCategory,
    handleDeleteCategory,
    handleDragStart,
    handleDragEnd,
    handleEditOpen,
    handleEditAddItem,
    handleEditRemoveItem,
    handleEditItemDisplayName,
    handleEditSave,
    handleSave,
  } = editor;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <LandingHeader />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }} role="status">
          <CircularProgress aria-label="Loading" />
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
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddCategory}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              {t('sitesCategoryAdd')}
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                bgcolor: 'secondary.main',
                color: '#000000',
                '&:hover': { bgcolor: 'secondary.dark' },
              }}
            >
              {t('sitesSave')}
            </Button>
          </Box>
        </Box>

        <TextField
          label={t('siteDescription')}
          value={siteDescription}
          onChange={(e) => setSiteDescription(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 3 }}
        />

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          <FileListPanel
            files={files}
            fileInputRef={fileInputRef}
            onUpload={handleUpload}
            onDeleteRequest={setDeleteTarget}
            t={t}
          />
          <CategoryAreaPanel
            categories={categories}
            activeCategory={activeCategory}
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onEdit={handleEditOpen}
            onDelete={handleDeleteCategory}
            t={t}
          />
        </Box>
      </Container>
      <SiteFooter />

      {/* ファイル削除確認ダイアログ */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} aria-labelledby="delete-dialog-title">
        <DialogTitle id="delete-dialog-title">{t('docsDelete')}</DialogTitle>
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

      {/* カテゴリ編集ダイアログ */}
      <Dialog open={!!editCategory} onClose={() => setEditCategory(null)} maxWidth="sm" fullWidth aria-labelledby="edit-dialog-title">
        <DialogTitle id="edit-dialog-title">{t('sitesEdit')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label={t('sitesCategoryTitle')}
            defaultValue={editCategory?.title ?? ''}
            onChange={(e) => { editFormRef.current.title = e.target.value; }}
            fullWidth
            size="small"
          />
          <TextField
            label={t('sitesCategoryDescription')}
            defaultValue={editCategory?.description ?? ''}
            onChange={(e) => { editFormRef.current.description = e.target.value; }}
            fullWidth
            size="small"
            multiline
            rows={3}
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 1 }}>
            {t('sitesCategoryItems')}
          </Typography>

          {editItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('sitesCategoryEmpty')}
            </Typography>
          ) : (
            <List dense disablePadding>
              {editItems.map((item) => (
                <ListItem
                  key={item.docKey}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label={t('sitesCategoryRemoveItem')}
                      onClick={() => handleEditRemoveItem(item.docKey)}
                      sx={{ '&:hover': { color: 'error.main' } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                  sx={{ pr: 5 }}
                >
                  <ListItemText
                    primary={
                      <TextField
                        size="small"
                        variant="standard"
                        defaultValue={item.displayName}
                        onChange={(e) => handleEditItemDisplayName(item.docKey, e.target.value)}
                        fullWidth
                        placeholder={t('sitesItemDisplayName')}
                      />
                    }
                    secondary={item.docKey}
                  />
                </ListItem>
              ))}
            </List>
          )}

          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            {t('sitesCategoryAddItem')}
          </Typography>
          <Box sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <List dense disablePadding>
              {files.map((file) => {
                const alreadyAdded = editItems.some((item) => item.docKey === file.key);
                return (
                  <ListItem key={file.key} disablePadding>
                    <Button
                      size="small"
                      onClick={() => handleEditAddItem(file)}
                      disabled={alreadyAdded}
                      fullWidth
                      sx={{ justifyContent: 'flex-start', textTransform: 'none', px: 2, opacity: alreadyAdded ? 0.5 : 1 }}
                    >
                      {file.name}
                    </Button>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCategory(null)}>{tCommon('cancel')}</Button>
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
```

**Step 2: コミット**

```bash
git add packages/web-app/src/app/docs/edit/EditBody.tsx
git commit -m "refactor: EditBody をカテゴリ編集UIに書き換え"
```

---

### Task 7: FileListPanel の props 簡素化

**Files:**
- Modify: `packages/web-app/src/app/docs/edit/FileListPanel.tsx`

**Step 1: onAddCard, cards props を削除**

ファイル一覧はアップロードと削除のみ。カテゴリへの追加は EditBody のダイアログ内で行う。

```tsx
'use client';

import { RefObject } from 'react';
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import type { useTranslations } from 'next-intl';
import type { DocFile } from '../../../types/layout';

interface FileListPanelProps {
  files: DocFile[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteRequest: (file: DocFile) => void;
  t: ReturnType<typeof useTranslations>;
}

export default function FileListPanel({
  files,
  fileInputRef,
  onUpload,
  onDeleteRequest,
  t,
}: FileListPanelProps) {
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
      <input ref={fileInputRef} type="file" accept=".md" hidden onChange={onUpload} />
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', maxHeight: 400, overflow: 'auto' }}>
        <List dense disablePadding>
          {files.map((file) => (
            <ListItem
              key={file.key}
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
    </Box>
  );
}
```

**Step 2: コミット**

```bash
git add packages/web-app/src/app/docs/edit/FileListPanel.tsx
git commit -m "refactor: FileListPanel からカード関連 props を削除"
```

---

### Task 8: SitesBody を GitHub Docs 風に書き換え

**Files:**
- Modify: `packages/web-app/src/app/docs/SitesBody.tsx`

**Step 1: カテゴリカード＋ドキュメントリスト形式に変更**

タグフィルタ、サムネイル、Avatar を削除。カテゴリタイトル + 説明 + ドキュメントリンクリストの構成にする。

```tsx
'use client';

import {
  Alert,
  Box,
  Card,
  CardContent,
  Container,
  Grid,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DescriptionIcon from '@mui/icons-material/Description';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import LandingHeader from '../components/LandingHeader';
import SiteFooter from '../components/SiteFooter';
import type { LayoutCategory } from '../../types/layout';

interface SitesBodyProps {
  initialData: {
    categories: LayoutCategory[];
    siteDescription?: string;
    error?: boolean;
  };
}

export default function SitesBody({ initialData }: SitesBodyProps) {
  const t = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const categories = initialData.categories;
  const siteDescription = initialData.siteDescription ?? '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LandingHeader />
      <Container maxWidth="lg" sx={{ flex: 1, py: 4, px: { xs: 2, md: 4 } }}>
        <Typography
          variant="h3"
          component="h1"
          sx={{
            fontWeight: 700,
            mb: siteDescription ? 1 : 4,
            color: 'text.primary',
            fontSize: { xs: '1.8rem', md: '2.4rem' },
          }}
        >
          {t('sitesPage')}
        </Typography>

        {siteDescription && (
          <Typography
            variant="body1"
            sx={{ color: 'text.secondary', mb: 4, lineHeight: 1.7 }}
          >
            {siteDescription}
          </Typography>
        )}

        {initialData.error && <Alert severity="error" sx={{ mb: 2 }}>{t('sitesLoadError')}</Alert>}

        {!initialData.error && categories.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <DescriptionIcon aria-hidden="true" sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
              {t('sitesEmpty')}
            </Typography>
            <Typography variant="body2" color="text.disabled">
              {t('docsEmptyHint')}
            </Typography>
          </Box>
        )}

        {!initialData.error && categories.length > 0 && (
          <Grid container spacing={3}>
            {categories.map((category) => (
              <Grid key={category.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    border: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    borderRadius: 3,
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Typography
                      variant="h6"
                      component="h2"
                      sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}
                    >
                      {category.title}
                    </Typography>
                    {category.description && (
                      <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7, mb: 2 }}>
                        {category.description}
                      </Typography>
                    )}
                    {category.items.length > 0 && (
                      <List dense disablePadding>
                        {category.items.map((item) => (
                          <ListItem key={item.docKey} disablePadding>
                            <ListItemButton
                              component={NextLink}
                              href={`/docs/view?key=${encodeURIComponent(item.docKey)}`}
                              sx={{
                                borderRadius: 1,
                                py: 0.5,
                                px: 1,
                                '&:hover': {
                                  bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                },
                              }}
                            >
                              <ListItemText
                                primary={item.displayName}
                                primaryTypographyProps={{
                                  variant: 'body2',
                                  color: 'primary.main',
                                  sx: { fontWeight: 500 },
                                }}
                              />
                            </ListItemButton>
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
      <SiteFooter />
    </Box>
  );
}
```

**Step 2: コミット**

```bash
git add packages/web-app/src/app/docs/SitesBody.tsx
git commit -m "refactor: SitesBody を GitHub Docs 風カテゴリ表示に書き換え"
```

---

### Task 9: page.tsx の initialData 型修正

**Files:**
- Modify: `packages/web-app/src/app/docs/page.tsx`

**Step 1: cards → categories に変更**

```tsx
import type { Metadata } from 'next';
import { fetchLayoutData } from '../../lib/s3Client';
import SitesBody from './SitesBody';

export const metadata: Metadata = {
  title: 'Docs - Anytime Markdown',
  description: 'Document site powered by Anytime Markdown',
  alternates: { canonical: '/docs' },
};

export const revalidate = 60;

export default async function SitesPage() {
  let initialData;
  try {
    initialData = await fetchLayoutData();
  } catch {
    initialData = { categories: [], error: true };
  }

  return <SitesBody initialData={initialData} />;
}
```

**Step 2: コミット**

```bash
git add packages/web-app/src/app/docs/page.tsx
git commit -m "fix: page.tsx の initialData を categories ベースに修正"
```

---

### Task 10: ビルド確認

**Step 1: TypeScript コンパイルチェック**

```bash
cd packages/web-app && npx tsc --noEmit
```

期待: エラーなし

**Step 2: ビルド確認**

```bash
cd packages/web-app && npm run build
```

期待: ビルド成功

**Step 3: 問題があれば修正してコミット**
