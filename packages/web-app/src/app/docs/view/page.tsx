'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Alert, Box, CircularProgress, Container, Link as MuiLink } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NextLink from 'next/link';
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
  const key = searchParams.get('key');
  const t = useTranslations('Landing');
  const { themeMode, setThemeMode } = useThemeMode();
  const { setLocale } = useLocaleSwitch();

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setError(t('docsViewNoUrl'));
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetch(`/api/docs/content?key=${encodeURIComponent(key)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setError(t('docsViewLoadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [key, t]);

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
          <MuiLink
            component={NextLink}
            href="/docs"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              mb: 3,
              textDecoration: 'none',
              color: 'text.secondary',
              '&:hover': { color: 'primary.main' },
            }}
          >
            <ArrowBackIcon sx={{ fontSize: 18 }} />
            {t('docsPage')}
          </MuiLink>
          <Alert severity="error">{error ?? t('docsViewLoadError')}</Alert>
        </Container>
        <SiteFooter />
      </Box>
    );
  }

  return (
    <MarkdownEditorPage
      externalContent={content}
      readOnly
      themeMode={themeMode}
      onThemeModeChange={setThemeMode}
      onLocaleChange={setLocale}
    />
  );
}
