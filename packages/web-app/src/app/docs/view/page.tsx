'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Alert, Box, CircularProgress, Container, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useThemeMode } from '../../providers';
import { useLocaleSwitch } from '../../LocaleProvider';
import LandingHeader from '../../components/LandingHeader';
import SiteFooter from '../../components/SiteFooter';

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

export default function DocsViewPage() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url');
  const t = useTranslations('Landing');
  const { themeMode, setThemeMode } = useThemeMode();
  const { setLocale } = useLocaleSwitch();

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setError(t('docsViewNoUrl'));
      setLoading(false);
      return;
    }
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(setContent)
      .catch(() => setError(t('docsViewLoadError')))
      .finally(() => setLoading(false));
  }, [url, t]);

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

  if (error || content === null) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <LandingHeader />
        <Container maxWidth="md" sx={{ flex: 1, py: 6 }}>
          <Alert severity="error">{error ?? t('docsViewLoadError')}</Alert>
        </Container>
        <SiteFooter />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LandingHeader />
      <Box sx={{ flex: 1 }}>
        <MarkdownEditorPage
          externalContent={content}
          readOnly
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          onLocaleChange={setLocale}
        />
      </Box>
      <SiteFooter />
    </Box>
  );
}
