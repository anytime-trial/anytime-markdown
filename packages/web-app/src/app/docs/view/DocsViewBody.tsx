'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Alert, Box, Container, Link as MuiLink } from '@mui/material';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import LandingHeader from '../../components/LandingHeader';
import MarkdownViewer from '../../components/MarkdownViewer';
import SiteFooter from '../../components/SiteFooter';

export default function DocsViewBody() {
  const searchParams = useSearchParams();
  const key = searchParams.get('key');
  const t = useTranslations('Landing');

  if (!key) {
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
          <Alert severity="error">{t('docsViewNoUrl')}</Alert>
        </Container>
        <SiteFooter />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <LandingHeader />
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <MarkdownViewer docKey={key} minHeight="calc(100vh - 64px)" />
      </Box>
    </Box>
  );
}
