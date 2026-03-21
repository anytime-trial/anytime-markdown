'use client';

import { ACCENT_COLOR } from '@anytime-markdown/editor-core';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { Box, Button, Container, IconButton, Link as MuiLink, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import MarkdownViewer from './MarkdownViewer';
import SiteFooter from './SiteFooter';

export default function LandingBody({ headingFontFamily }: { headingFontFamily?: string }) {
  const t = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [viewerHeight, setViewerHeight] = useState(600);
  useEffect(() => {
    const update = () => setViewerHeight(Math.round(window.innerHeight * 0.8));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  type FontSize = 'small' | 'medium' | 'large';
  const [viewerFontSize, setViewerFontSize] = useState<FontSize>('medium');
  const [showOutline, setShowOutline] = useState(false);
  const fontSizeOptions: { value: FontSize; iconSize: number; label: string }[] = [
    { value: 'small', iconSize: 12, label: t('fontSmall') },
    { value: 'medium', iconSize: 15, label: t('fontMedium') },
    { value: 'large', iconSize: 18, label: t('fontLarge') },
  ];

  return (
    <Box
      sx={{
        bgcolor: 'background.default',
      }}
    >
      {/* ---- Hero ---- */}
      <Box
        sx={{
          position: 'relative',
          minHeight: { xs: 'calc(100vh - 64px)', md: '80vh' },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
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
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontFamily: headingFontFamily || 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
              fontSize: { xs: '2.5rem', sm: '3.2rem', md: '4rem' },
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              mb: 3,
              color: 'text.primary',
            }}
          >
            {t('heroTitle')}
          </Typography>

          <Typography
            variant="h6"
            component="p"
            sx={{
              maxWidth: 560,
              mx: 'auto',
              color: 'text.secondary',
              fontSize: { xs: '1rem', md: '1.15rem' },
              lineHeight: 1.7,
              fontWeight: 400,
              mb: 5,
            }}
          >
            {t('heroDescription')}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Button
              component={NextLink}
              href="/markdown"
              variant="contained"
              size="large"
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                fontSize: { xs: '1.1rem', md: '1.25rem' },
                borderRadius: 3,
                px: { xs: 5, md: 7 },
                py: { xs: 1.5, md: 2 },
                width: { xs: '100%', sm: 'auto' },
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
                },
              }}
            >
              {t('openEditor')}
            </Button>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontSize: '0.8rem' }}
            >
              {t('noSignupRequired')}
            </Typography>
            <Button
              component={MuiLink}
              href="https://github.com/anytime-trial/anytime-markdown"
              target="_blank"
              rel="noopener noreferrer"
              variant="text"
              size="small"
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.85rem',
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  bgcolor: 'transparent',
                  textDecoration: 'underline',
                },
              }}
            >
              GitHub
            </Button>
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
            {t.rich('experimentalNotice', {
              github: (chunks) => (
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

      {/* ---- Features (Markdown) ---- */}
      <Box sx={{ py: { xs: 4, md: 6 }, px: 3 }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, alignItems: 'center' }}>
            <Tooltip title={t('toggleOutline')}>
              <IconButton
                size="small"
                onClick={() => setShowOutline((v) => !v)}
                sx={{
                  width: 28,
                  height: 28,
                  color: showOutline ? 'primary.main' : 'text.secondary',
                  bgcolor: showOutline ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)') : 'transparent',
                }}
                aria-label={t('toggleOutline')}
                aria-pressed={showOutline}
              >
                <ListAltIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
            {fontSizeOptions.map(({ value, iconSize, label }) => (
              <Tooltip key={value} title={label}>
                <IconButton
                  size="small"
                  onClick={() => setViewerFontSize(value)}
                  sx={{
                    width: 28,
                    height: 28,
                    color: viewerFontSize === value ? 'primary.main' : 'text.secondary',
                    bgcolor: viewerFontSize === value ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)') : 'transparent',
                  }}
                  aria-label={label}
                  aria-pressed={viewerFontSize === value}
                >
                  <Typography sx={{ fontSize: iconSize, fontWeight: 700, lineHeight: 1 }}>A</Typography>
                </IconButton>
              </Tooltip>
            ))}
            </Box>
          </Box>
          <MarkdownViewer docKey="docs/markdownAll/markdownAll.ja.md" docKeyByLocale={{ en: "docs/markdownAll/markdownAll.en.md" }} editorHeight={viewerHeight} showOutline={showOutline} fontSize={viewerFontSize} />
        </Container>
      </Box>

      <SiteFooter />
    </Box>
  );
}
