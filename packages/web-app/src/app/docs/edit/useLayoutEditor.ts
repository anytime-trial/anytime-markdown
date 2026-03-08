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
  const [urlLinks, setUrlLinks] = useState<{ url: string; displayName: string }[]>([]);
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
    return fetch('/api/docs', { cache: 'no-store' })
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
        const cats = (layoutData.categories ?? [])
          .map((c) => ({ ...c, items: c.items ?? [] }))
          .sort((a, b) => a.order - b.order);
        setCategories(cats);
        // URLリンクをカテゴリ内アイテムから収集して復元
        const urls = new Map<string, string>();
        for (const c of cats) {
          for (const item of c.items) {
            if (item.url && !urls.has(item.url)) {
              urls.set(item.url, item.displayName);
            }
          }
        }
        setUrlLinks(Array.from(urls, ([url, displayName]) => ({ url, displayName })));
        if (layoutData.siteDescription) setSiteDescription(layoutData.siteDescription);
      })
      .catch(() => setSnackbar({ message: t('sitesLoadError'), severity: 'error' }))
      .finally(() => setLoading(false));
  }, [t, fetchFiles]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    let hasError = false;
    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/docs/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        hasError = true;
      }
    }

    if (hasError) {
      setSnackbar({ message: t('docsUploadError'), severity: 'error' });
    } else {
      setSnackbar({ message: t('docsUploadSuccess'), severity: 'success' });
    }
    fetchFiles();

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

  const handleRemoveItem = useCallback((categoryId: string, docKey: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId ? { ...c, items: c.items.filter((item) => item.docKey !== docKey) } : c,
      ),
    );
  }, []);

  const handleUpdateField = useCallback((categoryId: string, field: 'title' | 'description', value: string) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, [field]: value } : c)),
    );
  }, []);

  const handleUpdateItemDisplayName = useCallback((categoryId: string, docKey: string, displayName: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? { ...c, items: c.items.map((item) => (item.docKey === docKey ? { ...item, displayName } : item)) }
          : c,
      ),
    );
  }, []);

  const handleReorderItems = useCallback((categoryId: string, oldIndex: number, newIndex: number) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== categoryId) return c;
        const items = arrayMove(c.items, oldIndex, newIndex);
        return { ...c, items };
      }),
    );
  }, []);

  const handleDropFile = useCallback((categoryId: string, fileKey: string, fileName: string) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== categoryId) return c;
        if (c.items.some((item) => item.docKey === fileKey)) return c;
        return { ...c, items: [...c.items, { docKey: fileKey, displayName: fileName.replace(/\.md$/, '') }] };
      }),
    );
  }, []);

  const handleDropUrl = useCallback((categoryId: string, url: string, displayName: string) => {
    const docKey = `url:${url}`;
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== categoryId) return c;
        if (c.items.some((item) => item.docKey === docKey)) return c;
        return { ...c, items: [...c.items, { docKey, displayName, url }] };
      }),
    );
  }, []);

  const handleAddUrlLink = useCallback((url: string, displayName: string) => {
    setUrlLinks((prev) => {
      if (prev.some((l) => l.url === url)) return prev;
      return [...prev, { url, displayName }];
    });
  }, []);

  const handleDeleteUrlLink = useCallback((url: string) => {
    setUrlLinks((prev) => prev.filter((l) => l.url !== url));
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
    handleRemoveItem,
    handleUpdateField,
    handleUpdateItemDisplayName,
    handleReorderItems,
    handleDropFile,
    handleDropUrl,
    urlLinks,
    handleAddUrlLink,
    handleDeleteUrlLink,
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
