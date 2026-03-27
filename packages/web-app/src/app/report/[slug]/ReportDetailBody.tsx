'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Alert, Box, Chip, Container, Divider, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';

import type { ReportMeta } from '../../../types/report';
import LandingHeader from '../../components/LandingHeader';
import MarkdownViewer from '../../components/MarkdownViewer';
import SiteFooter from '../../components/SiteFooter';

interface ReportDetailBodyProps {
  report: { meta: ReportMeta; content: string } | null;
  prev: ReportMeta | null;
  next: ReportMeta | null;
}

export default function ReportDetailBody({ report, prev, next }: Readonly<ReportDetailBodyProps>) {
  const t = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!report) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <LandingHeader />
        <Container maxWidth="md" sx={{ flex: 1, py: 6 }}>
          <Alert severity="error">{t('reportLoadError')}</Alert>
        </Container>
        <SiteFooter />
      </Box>
    );
  }

  const { meta } = report;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LandingHeader />

      {/* Article Header */}
      <Container maxWidth="md" sx={{ pt: { xs: 4, md: 6 }, px: { xs: 2, md: 3 } }}>
        {meta.category && (
          <Chip
            label={meta.category}
            size="small"
            sx={{
              mb: 2,
              bgcolor: 'rgba(232,160,18,0.15)',
              color: '#E8A012',
              fontWeight: 600,
              fontSize: '0.75rem',
              borderRadius: '4px',
            }}
          />
        )}
        <Typography
          variant="h3"
          component="h1"
          sx={{
            fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
            fontWeight: 700,
            mb: 2,
            color: 'text.primary',
            fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' },
            lineHeight: 1.3,
          }}
        >
          {meta.title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
            {meta.date}
          </Typography>
          {meta.author && (
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              {meta.author}
            </Typography>
          )}
        </Box>
      </Container>

      {/* Article Body */}
      <Container maxWidth="md" sx={{ flex: 1, px: { xs: 2, md: 3 }, pb: 4 }}>
        <MarkdownViewer
          docKey={meta.key}
          contentApiPath="/api/reports/content"
          noScroll
        />
      </Container>

      {/* Prev/Next Navigation */}
      <Container maxWidth="md" sx={{ px: { xs: 2, md: 3 }, pb: 6 }}>
        <Divider sx={{ mb: 4 }} />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            flexDirection: { xs: 'column', sm: 'row' },
          }}
        >
          {prev ? (
            <Box
              component={NextLink}
              href={`/report/${prev.slug}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                textDecoration: 'none',
                color: '#90CAF9',
                fontSize: '0.875rem',
                fontWeight: 500,
                p: 1.5,
                borderRadius: '8px',
                transition: 'background-color 0.15s',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                flex: 1,
              }}
            >
              <ArrowBackIcon sx={{ fontSize: 18 }} />
              <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {prev.title}
              </Box>
            </Box>
          ) : (
            <Box sx={{ flex: 1 }} />
          )}
          {next ? (
            <Box
              component={NextLink}
              href={`/report/${next.slug}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                textDecoration: 'none',
                color: '#90CAF9',
                fontSize: '0.875rem',
                fontWeight: 500,
                p: 1.5,
                borderRadius: '8px',
                transition: 'background-color 0.15s',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                flex: 1,
                justifyContent: 'flex-end',
                textAlign: 'right',
              }}
            >
              <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {next.title}
              </Box>
              <ArrowForwardIcon sx={{ fontSize: 18 }} />
            </Box>
          ) : (
            <Box sx={{ flex: 1 }} />
          )}
        </Box>
      </Container>

      <SiteFooter />
    </Box>
  );
}
