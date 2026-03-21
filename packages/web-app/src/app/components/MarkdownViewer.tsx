'use client';

import { Alert, Box, Button, CircularProgress } from '@mui/material';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocaleSwitch } from '../LocaleProvider';
import { useThemeMode } from '../providers';

const MarkdownEditorPage = dynamic(
  () => import('@anytime-markdown/editor-core/src/MarkdownEditorPage'),
  {
    ssr: false,
    loading: () => (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress aria-label="Loading viewer" />
      </Box>
    ),
  }
);

interface MarkdownViewerProps {
  /** S3 ドキュメントキー（デコード済み、例: "docs/markdownAll/markdownAll.ja.md"） */
  docKey: string;
  /** ロケール別の docKey マップ（例: { en: "docs/markdownAll/markdownAll.en.md" }）。未指定ロケールは docKey を使用 */
  docKeyByLocale?: Partial<Record<string, string>>;
  /** コンテナの最小高さ */
  minHeight?: string;
  /** エディタの高さ（px） */
  editorHeight?: number;
  /** スクロールなしで全体表示 */
  noScroll?: boolean;
}

export default function MarkdownViewer({ docKey, docKeyByLocale, minHeight = '60vh', editorHeight, noScroll }: Readonly<MarkdownViewerProps>) {
  const t = useTranslations('Landing');
  const { themeMode, setThemeMode } = useThemeMode();
  const { locale, setLocale } = useLocaleSwitch();

  // ロケールに応じた docKey を決定
  const resolvedDocKey = docKeyByLocale?.[locale] ?? docKey;

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const editorKeyRef = useRef(0);

  const fetchContent = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/docs/content?key=${encodeURIComponent(resolvedDocKey)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        setContent(text);
        editorKeyRef.current += 1;
      })
      .catch(() => {
        setError(t('docsViewLoadError'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [resolvedDocKey, t]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight }} role="status">
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }

  if (error || content === null) {
    return (
      <Box sx={{ px: 3, py: 4 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={fetchContent}>
              {t('docsViewRetry')}
            </Button>
          }
        >
          {error ?? t('docsViewLoadError')}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight, overflow: 'hidden' }}>
      <MarkdownEditorPage
        key={editorKeyRef.current}
        externalContent={content}
        readOnly
        hideToolbar
        hideStatusBar
        noScroll={noScroll}
        fixedEditorHeight={editorHeight}
        defaultBlockAlign="center"
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        onLocaleChange={setLocale}
      />
    </Box>
  );
}
