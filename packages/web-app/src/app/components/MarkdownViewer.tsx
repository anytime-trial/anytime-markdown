'use client';

import { Alert, Box, Button, CircularProgress } from '@mui/material';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

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
  /** S3 ドキュメントキー（例: "docs%2Finfrastructure.md"） */
  docKey: string;
  /** コンテナの最小高さ */
  minHeight?: string;
}

export default function MarkdownViewer({ docKey, minHeight = '60vh' }: MarkdownViewerProps) {
  const t = useTranslations('Landing');
  const { themeMode, setThemeMode } = useThemeMode();
  const { setLocale } = useLocaleSwitch();

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/docs/content?key=${encodeURIComponent(docKey)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        setContent(text);
      })
      .catch(() => {
        setError(t('docsViewLoadError'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [docKey, t]);

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
              {t('retry')}
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
        externalContent={content}
        readOnly
        hideToolbar
        hideStatusBar
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        onLocaleChange={setLocale}
      />
    </Box>
  );
}
