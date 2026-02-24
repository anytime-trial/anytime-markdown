'use client';

import { useState, useEffect, useCallback } from 'react';
import { TiptapEditor } from '@anytime-markdown/editor-core';

const STORAGE_KEY = 'anytime-markdown-content';
const DEFAULT_CONTENT = '# Welcome\n\nStart writing your markdown here...';

export function WebMarkdownEditor() {
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setContent(saved ?? DEFAULT_CONTENT);
    setLoaded(true);
  }, []);

  const handleUpdate = useCallback((markdown: string) => {
    setContent(markdown);
    localStorage.setItem(STORAGE_KEY, markdown);
  }, []);

  const handleSave = useCallback(() => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [content]);

  if (!loaded) {
    return null;
  }

  return (
    <TiptapEditor
      content={content}
      baseUri=""
      onUpdate={handleUpdate}
      onSave={handleSave}
    />
  );
}
