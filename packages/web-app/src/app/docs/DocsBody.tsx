'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Container,
  Link as MuiLink,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DescriptionIcon from '@mui/icons-material/Description';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocaleSwitch } from '../LocaleProvider';
import LandingHeader from '../components/LandingHeader';
import SiteFooter from '../components/SiteFooter';

interface DocFile {
  key: string;
  name: string;
  lastModified: string;
  size: number;
}

export default function DocsBody() {
  const { locale } = useLocaleSwitch();
  const t = useTranslations('Landing');
  const [files, setFiles] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/docs')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ files: DocFile[] }>;
      })
      .then((data) => {
        if (!cancelled) setFiles(data.files);
      })
      .catch(() => {
        if (!cancelled) setError(t('docsLoadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [t]);

  const formatDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LandingHeader />
      <Container maxWidth="md" sx={{ flex: 1, py: 4, px: { xs: 2, md: 4 } }}>
        <MuiLink
          component={NextLink}
          href="/"
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
          {t('backToHome')}
        </MuiLink>

        <Typography
          variant="h3"
          component="h1"
          sx={{
            fontWeight: 700,
            mb: 1,
            color: 'text.primary',
            fontSize: { xs: '1.8rem', md: '2.4rem' },
          }}
        >
          {t('docsPage')}
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 4 }}>
          {t('docsDescription')}
        </Typography>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && files.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            {t('docsEmpty')}
          </Typography>
        )}

        {!loading && !error && files.length > 0 && (
          <List sx={{ bgcolor: 'background.paper', borderRadius: 2, border: 1, borderColor: 'divider' }}>
            {files.map((file, index) => (
              <ListItemButton
                key={file.key}
                component={NextLink}
                href={`/docs/view?key=${encodeURIComponent(file.key)}`}
                divider={index < files.length - 1}
                sx={{ py: 1.5 }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <DescriptionIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText
                  primary={file.name}
                  secondary={formatDate(file.lastModified)}
                  primaryTypographyProps={{ fontWeight: 500 }}
                  secondaryTypographyProps={{ fontSize: '0.8rem' }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Container>
      <SiteFooter />
    </Box>
  );
}
