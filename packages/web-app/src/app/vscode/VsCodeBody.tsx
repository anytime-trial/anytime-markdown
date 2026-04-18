'use client';

import { ACCENT_COLOR } from '@anytime-markdown/markdown-core';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CodeIcon from '@mui/icons-material/Code';
import ImageIcon from '@mui/icons-material/Image';
import SyncIcon from '@mui/icons-material/Sync';
import TimelineIcon from '@mui/icons-material/Timeline';
import ViewCompactIcon from '@mui/icons-material/ViewCompact';
import {
  Box,
  Button,
  Container,
  Link as MuiLink,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';

import LandingHeader from '../components/LandingHeader';
import MarkdownViewer from '../components/MarkdownViewer';
import SiteFooter from '../components/SiteFooter';

const MARKDOWN_MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-markdown';

const TRAIL_MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail';

const richGithubLink = (chunks: ReactNode) => (
  <MuiLink
    href="https://github.com/anytime-trial/anytime-markdown"
    target="_blank"
    rel="noopener noreferrer"
    sx={{ color: 'text.secondary', textDecorationColor: 'inherit' }}
  >
    {chunks}
  </MuiLink>
);

const MD_BENEFITS = [
  { key: 'md3', icon: <CodeIcon aria-hidden="true" sx={{ fontSize: 40 }} /> },
  { key: 'md1', icon: <AutoFixHighIcon aria-hidden="true" sx={{ fontSize: 40 }} /> },
  { key: 'md2', icon: <ViewCompactIcon aria-hidden="true" sx={{ fontSize: 40 }} /> },
] as const;

const TRAIL_BENEFITS = [
  { key: 'trail1', icon: <AccountTreeIcon aria-hidden="true" sx={{ fontSize: 40 }} /> },
  { key: 'trail2', icon: <SyncIcon aria-hidden="true" sx={{ fontSize: 40 }} /> },
  { key: 'trail3', icon: <TimelineIcon aria-hidden="true" sx={{ fontSize: 40 }} /> },
  { key: 'trail4', icon: <ImageIcon aria-hidden="true" sx={{ fontSize: 40 }} /> },
] as const;

function MarketplaceButton({ href, label, caption, isDark, variant }: Readonly<{ href: string; label: string; caption: string; isDark: boolean; variant: 'contained' | 'outlined' }>) {
  const isContained = variant === 'contained';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <Button
        component={MuiLink}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        variant={variant}
        size="large"
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          fontSize: { xs: '1rem', md: '1.15rem' },
          borderRadius: 3,
          px: { xs: 4, md: 6 },
          py: { xs: 1.2, md: 1.8 },
          width: { xs: '100%', sm: 'auto' },
          minWidth: { sm: 240 },
          ...(isContained
            ? {
                bgcolor: ACCENT_COLOR,
                color: '#000000',
                boxShadow: isDark
                  ? '0 0 40px rgba(232,160,18,0.25)'
                  : '0 4px 20px rgba(232,160,18,0.3)',
                '&:hover': {
                  bgcolor: '#d4920e',
                  boxShadow: isDark
                    ? '0 0 50px rgba(232,160,18,0.35)'
                    : '0 6px 28px rgba(232,160,18,0.4)',
                  textDecoration: 'none',
                },
              }
            : {
                borderColor: ACCENT_COLOR,
                color: ACCENT_COLOR,
                '&:hover': {
                  borderColor: '#d4920e',
                  bgcolor: isDark ? 'rgba(232,160,18,0.08)' : 'rgba(232,160,18,0.04)',
                },
              }),
        }}
      >
        {label}
      </Button>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
        {caption}
      </Typography>
    </Box>
  );
}

function BenefitItem({ icon, title, body, isDark }: Readonly<{ icon: ReactNode; title: string; body: string; isDark: boolean }>) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: 'center',
        gap: { xs: 3, md: 6 },
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          width: 80,
          height: 80,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: isDark ? 'rgba(232,160,18,0.1)' : 'rgba(232,160,18,0.08)',
          color: ACCENT_COLOR,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, textAlign: { xs: 'center', md: 'left' } }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}>
          {title}
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: 'text.secondary', lineHeight: 1.8 }}
        >
          {body}
        </Typography>
      </Box>
    </Box>
  );
}

export default function VsCodeBody() {
  const t = useTranslations('VsCode');
  const tLanding = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [viewerHeight, setViewerHeight] = useState(300);
  useEffect(() => {
    const update = () => setViewerHeight(Math.round(window.innerHeight * 0.4));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <LandingHeader />

      {/* ---- Hero ---- */}
      <Box
        sx={{
          position: 'relative',
          minHeight: { xs: 'auto', md: '70vh' },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: { xs: 'center', md: 'left' },
          px: { xs: 0, md: 3 },
          py: { xs: 10, md: 0 },
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: isDark
              ? 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(232,160,18,0.08) 0%, transparent 70%)'
              : 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(232,160,18,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          },
        }}
      >
        <Container maxWidth="md" disableGutters sx={{ position: 'relative', zIndex: 1, px: { xs: 2, md: 3 } }}>
          <Typography
            component="h1"
            sx={{
              m: 0,
              mb: 3,
              pl: '1em',
              pr: '1em',
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
              fontSize: { xs: '2.2rem', md: '3.8rem' },
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              color: 'text.primary',
            }}
          >
            <Box component="span" sx={{ display: 'block' }}>
              {t('heroTitle1')}
            </Box>
            <Box component="span" sx={{ display: 'block', textAlign: 'right' }}>
              {t('heroTitle2')}
            </Box>
          </Typography>

          <Typography
            variant="h6"
            component="p"
            sx={{
              color: 'text.secondary',
              fontSize: { xs: '1rem', md: '1.15rem' },
              lineHeight: 1.7,
              fontWeight: 400,
              whiteSpace: 'pre-line',
              mb: 5,
            }}
          >
            {t('heroDescription')}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
            <MarketplaceButton href={MARKDOWN_MARKETPLACE_URL} label={t('installButton')} caption={t('installCaption')} isDark={isDark} variant="contained" />
            <MarketplaceButton href={TRAIL_MARKETPLACE_URL} label={t('trailInstallButton')} caption={t('trailInstallCaption')} isDark={isDark} variant="contained" />
          </Box>

          <Typography
            variant="body2"
            sx={{
              mt: 4,
              color: 'text.secondary',
              fontSize: '0.8rem',
              lineHeight: 1.6,
            }}
          >
            {tLanding.rich('experimentalNotice', {
              github: richGithubLink,
            })}
          </Typography>
        </Container>
      </Box>

      {/* ---- Product 1: Anytime Trail ---- */}
      <Box sx={{ py: { xs: 8, md: 12 }, px: { xs: 0, md: 3 } }}>
        <Container maxWidth="lg" disableGutters sx={{ px: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: { xs: 6, md: 8 } }}>
            <Box
              component="img"
              src="/images/camel_trail.png"
              alt="Anytime Trail icon"
              sx={{ width: 48, height: 48, borderRadius: 2 }}
            />
            <Typography
              variant="h4"
              component="h2"
              sx={{ fontWeight: 700, color: 'text.primary' }}
            >
              {t('trailSectionTitle')}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 6, md: 8 } }}>
            {TRAIL_BENEFITS.map(({ key, icon }) => (
              <BenefitItem key={key} icon={icon} title={t(`${key}Title`)} body={t(`${key}Body`)} isDark={isDark} />
            ))}
          </Box>

          <Box sx={{ mt: { xs: 4, md: 6 }, textAlign: 'center' }}>
            <Box
              component="img"
              src="/images/c4-mermaid.png"
              alt={t('trail1Title')}
              sx={{
                maxWidth: '100%',
                height: 'auto',
                borderRadius: 2,
              }}
            />
          </Box>
        </Container>
      </Box>

      {/* ---- Product 2: Anytime Markdown ---- */}
      <Box sx={{ py: { xs: 8, md: 12 }, px: { xs: 0, md: 3 } }}>
        <Container maxWidth="lg" disableGutters sx={{ px: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: { xs: 6, md: 8 } }}>
            <Box
              component="img"
              src="/images/camel_markdown.png"
              alt="Anytime Markdown icon"
              sx={{ width: 48, height: 48, borderRadius: 2 }}
            />
            <Typography
              variant="h4"
              component="h2"
              sx={{ fontWeight: 700, color: 'text.primary' }}
            >
              {t('markdownSectionTitle')}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 6, md: 8 } }}>
            {MD_BENEFITS.map(({ key, icon }) => (
              <BenefitItem key={key} icon={icon} title={t(`${key}Title`)} body={t(`${key}Body`)} isDark={isDark} />
            ))}
          </Box>
        </Container>
      </Box>

      {/* ---- Markdown Preview ---- */}
      <Box sx={{
        py: { xs: 4, md: 6 },
        px: 0,
        '& #main-content': { px: { xs: 0, md: 3 } },
      }}>
        <Container maxWidth="lg" disableGutters>
          <MarkdownViewer
            docKey="docs/markdownAll/markdownAll.ja.md"
            docKeyByLocale={{ en: "docs/markdownAll/markdownAll.en.md" }}
            editorHeight={viewerHeight}
            showFrontmatter
          />
        </Container>
      </Box>

      {/* ---- CTA ---- */}
      <Box sx={{ py: { xs: 8, md: 10 }, px: { xs: 0, md: 3 }, textAlign: 'center' }}>
        <Container maxWidth="md" disableGutters sx={{ px: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
            <MarketplaceButton href={MARKDOWN_MARKETPLACE_URL} label={t('installButton')} caption={t('installCaption')} isDark={isDark} variant="contained" />
            <MarketplaceButton href={TRAIL_MARKETPLACE_URL} label={t('trailInstallButton')} caption={t('trailInstallCaption')} isDark={isDark} variant="contained" />
          </Box>
        </Container>
      </Box>

      <SiteFooter />
    </Box>
  );
}
