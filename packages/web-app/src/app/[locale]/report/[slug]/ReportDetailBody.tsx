'use client';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Alert, Box, Breadcrumbs, Chip, Container, Link as MuiLink, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link as NextLink } from '../../../../i18n/navigation';
import { useTranslations } from 'next-intl';

import type { ReportMeta } from '../../../../types/report';
import LandingHeader from '../../components/LandingHeader';
import MarkdownViewer from '../../components/MarkdownViewer';

interface ReportDetailBodyProps {
  /**
   * 記事のメタ情報。本文（Markdown 原文）はここへ渡さない — 表示に使わないまま
   * RSC ペイロードへ載り、記事 1 本で数十 KB を空費していた。
   */
  meta: ReportMeta | null;
  /** サーバで HTML 化した本文。クローラと初回表示が読むのはこれ */
  bodyHtml: string;
  prev: ReportMeta | null;
  next: ReportMeta | null;
}

export default function ReportDetailBody({ meta, bodyHtml }: Readonly<ReportDetailBodyProps>) {
  const t = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!meta) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <LandingHeader />
        <Container maxWidth="md" sx={{ flex: 1, py: 6 }}>
          <Alert severity="error">{t('reportLoadError')}</Alert>
        </Container>
      </Box>
    );
  }


  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LandingHeader />

      {/* Breadcrumbs */}
      <Box
        component="nav"
        aria-label={t('ariaBreadcrumb')}
        sx={{
          px: 2,
          py: 0.75,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
        }}
      >
        <Breadcrumbs
          separator={<ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
          sx={{ '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' } }}
        >
          <MuiLink
            component={NextLink}
            href="/report"
            underline="hover"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.8125rem', color: 'text.secondary' }}
          >
            {t('reportPage')}
          </MuiLink>
          <Typography
            sx={{
              fontSize: '0.8125rem',
              color: 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: { xs: 200, sm: 400 },
            }}
          >
            {meta.title}
          </Typography>
        </Breadcrumbs>
      </Box>

      {/* Article Header */}
      <Container maxWidth="lg" sx={{ pt: { xs: 4, md: 6 }, px: { xs: 2, md: 3 } }}>
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
      <Container maxWidth="lg" sx={{ flex: 1, px: { xs: 0, md: 3 }, '& #main-content': { px: { xs: 0, md: 3 } } }}>
        <MarkdownViewer
          staticHtml={bodyHtml}
          docKey={meta.key}
          contentApiPath="/api/reports/content"
          noScroll
          minimal
          measure="wide"
        />
      </Container>
    </Box>
  );
}
