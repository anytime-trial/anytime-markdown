'use client';

import { ACCENT_COLOR } from '@anytime-markdown/editor-core';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CodeIcon from '@mui/icons-material/Code';
import ImageIcon from '@mui/icons-material/Image';
import SchemaIcon from '@mui/icons-material/Schema';
import SourceIcon from '@mui/icons-material/Source';
import {
  Box,
  Button,
  Container,
  Link as MuiLink,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';

import LandingHeader from '../components/LandingHeader';
import MarkdownViewer from '../components/MarkdownViewer';
import SiteFooter from '../components/SiteFooter';

const MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-markdown';

const BENEFITS = [
  { key: 'benefit1', icon: <CodeIcon sx={{ fontSize: 40 }} /> },
  { key: 'benefit2', icon: <AutoFixHighIcon sx={{ fontSize: 40 }} /> },
  { key: 'benefit3', icon: <ImageIcon sx={{ fontSize: 40 }} /> },
  { key: 'benefit4', icon: <SourceIcon sx={{ fontSize: 40 }} /> },
  { key: 'benefit5', icon: <SchemaIcon sx={{ fontSize: 40 }} /> },
] as const;


export default function VsCodeBody() {
  const t = useTranslations('VsCode');
  const tLanding = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [viewerHeight, setViewerHeight] = useState(600);
  useEffect(() => {
    const update = () => setViewerHeight(Math.round(globalThis.innerHeight * 0.8));
    update();
    globalThis.addEventListener('resize', update);
    return () => globalThis.removeEventListener('resize', update);
  }, []);

  return (
    <Box sx={{ height: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
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
          px: 3,
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
        <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1 }}>
          <Box component="h1" sx={{ m: 0, mb: 3, pl: '1em', pr: '1em' }}>
            <Typography
              variant="h2"
              component="span"
              sx={{
                display: 'block',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 700,
                fontSize: { xs: '2.2rem', sm: '3rem', md: '3.8rem' },
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                color: 'text.primary',
              }}
            >
              {t('heroTitle1')}
            </Typography>
            <Typography
              variant="h2"
              component="span"
              sx={{
                display: 'block',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 700,
                fontSize: { xs: '2.2rem', sm: '3rem', md: '3.8rem' },
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                color: 'text.primary',
                textAlign: 'right',
              }}
            >
              {t('heroTitle2')}
            </Typography>
          </Box>

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

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'center', gap: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Button
                component={MuiLink}
                href={MARKETPLACE_URL}
                target="_blank"
                rel="noopener noreferrer"
                variant="contained"
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
                }}
              >
                {t('installButton')}
              </Button>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                {t('installCaption')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Button
                component={NextLink}
                href="/markdown"
                variant="outlined"
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
                  borderColor: ACCENT_COLOR,
                  color: ACCENT_COLOR,
                  '&:hover': {
                    borderColor: '#d4920e',
                    bgcolor: isDark ? 'rgba(232,160,18,0.08)' : 'rgba(232,160,18,0.04)',
                  },
                }}
              >
                {tLanding('openEditor')}
              </Button>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                {t('editorCaption')}
              </Typography>
            </Box>
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
              github: (chunks: ReactNode) => (
                <MuiLink
                  href="https://github.com/anytime-trial/anytime-markdown"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: 'text.secondary', textDecorationColor: 'inherit' }}
                >
                  {chunks}
                </MuiLink>
              ),
            })}
          </Typography>
        </Container>
      </Box>

      {/* ---- Benefits ---- */}
      <Box sx={{ py: { xs: 8, md: 12 }, px: 3 }}>
        <Container maxWidth="lg">
          <Typography
            variant="h4"
            component="h2"
            sx={{
              fontWeight: 700,
              textAlign: 'center',
              mb: { xs: 6, md: 8 },
              color: 'text.primary',
            }}
          >
            {t('benefitsTitle')}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 6, md: 8 } }}>
            {BENEFITS.map(({ key, icon }, i) => (
              <Box
                key={key}
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', md: i % 2 === 0 ? 'row' : 'row-reverse' },
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
                    {t(`${key}Title`)}
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ color: 'text.secondary', lineHeight: 1.8, maxWidth: 600 }}
                  >
                    {t(`${key}Body`)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ---- Markdown Preview ---- */}
      <Box sx={{ py: { xs: 4, md: 6 }, px: 3 }}>
        <Container maxWidth="lg">
          <MarkdownViewer
            docKey="docs/markdownAll/markdownAll.ja.md"
            docKeyByLocale={{ en: "docs/markdownAll/markdownAll.en.md" }}
            editorHeight={viewerHeight}
          />
        </Container>
      </Box>

      {/* ---- CTA ---- */}
      <Box sx={{ py: { xs: 8, md: 10 }, px: 3, textAlign: 'center' }}>
        <Container maxWidth="sm">
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'center', gap: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Button
                component={MuiLink}
                href={MARKETPLACE_URL}
                target="_blank"
                rel="noopener noreferrer"
                variant="contained"
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
                }}
              >
                {t('installButton')}
              </Button>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                {t('installCaption')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Button
                component={NextLink}
                href="/markdown"
                variant="outlined"
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
                  borderColor: ACCENT_COLOR,
                  color: ACCENT_COLOR,
                  '&:hover': {
                    borderColor: '#d4920e',
                    bgcolor: isDark ? 'rgba(232,160,18,0.08)' : 'rgba(232,160,18,0.04)',
                  },
                }}
              >
                {tLanding('openEditor')}
              </Button>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                {t('editorCaption')}
              </Typography>
            </Box>
          </Box>
        </Container>
      </Box>

      <SiteFooter />
    </Box>
  );
}
