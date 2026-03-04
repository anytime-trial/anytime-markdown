'use client';

import { Box, Container, Typography, Button, Card, CardContent, Grid, Link as MuiLink } from '@mui/material';
import EditNoteIcon from '@mui/icons-material/EditNote';
import CodeIcon from '@mui/icons-material/Code';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InstallDesktopIcon from '@mui/icons-material/InstallDesktop';
import NextLink from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useTheme } from '@mui/material/styles';

const featureItems = [
  { titleKey: 'featureWysiwyg' as const, descKey: 'featureWysiwygDesc' as const, Icon: EditNoteIcon },
  { titleKey: 'featureSource' as const, descKey: 'featureSourceDesc' as const, Icon: CodeIcon },
  { titleKey: 'featureDiff' as const, descKey: 'featureDiffDesc' as const, Icon: CompareArrowsIcon },
  { titleKey: 'featureDiagram' as const, descKey: 'featureDiagramDesc' as const, Icon: AccountTreeIcon },
  { titleKey: 'featurePdf' as const, descKey: 'featurePdfDesc' as const, Icon: PictureAsPdfIcon },
  { titleKey: 'featurePwa' as const, descKey: 'featurePwaDesc' as const, Icon: InstallDesktopIcon },
];

export default function LandingBody({ headingFontFamily }: { headingFontFamily?: string }) {
  const t = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

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

          <Button
            component={NextLink}
            href="/markdown"
            variant="contained"
            size="large"
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '1.05rem',
              borderRadius: 2.5,
              px: 5,
              py: 1.5,
              bgcolor: '#e8a012',
              color: '#1a1a1a',
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
            variant="body2"
            sx={{
              mt: 4,
              color: 'text.disabled',
              fontSize: '0.8rem',
              lineHeight: 1.6,
            }}
          >
            {t.rich('experimentalNotice', {
              github: (chunks) => (
                <MuiLink
                  href="https://github.com/kiyotaka-ueda/anytime-markdown"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: 'text.disabled', textDecorationColor: 'inherit' }}
                >
                  {chunks}
                </MuiLink>
              ),
            })}
          </Typography>
        </Container>
      </Box>

      {/* ---- Features ---- */}
      <Box sx={{ py: { xs: 8, md: 12 }, px: 3 }}>
        <Container maxWidth="lg">
          <Typography
            variant="overline"
            component="h2"
            sx={{
              display: 'block',
              textAlign: 'center',
              letterSpacing: '0.2em',
              color: '#e8a012',
              fontWeight: 700,
              fontSize: '0.85rem',
              mb: 6,
            }}
          >
            {t('features')}
          </Typography>

          <Grid container spacing={3}>
            {featureItems.map(({ titleKey, descKey, Icon }) => (
              <Grid key={titleKey} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    border: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    borderRadius: 3,
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      borderColor: 'rgba(232,160,18,0.4)',
                      boxShadow: isDark
                        ? '0 0 24px rgba(232,160,18,0.08)'
                        : '0 4px 16px rgba(232,160,18,0.1)',
                    },
                  }}
                >
                  <CardContent sx={{ p: 3.5 }}>
                    <Icon
                      sx={{
                        fontSize: 32,
                        color: '#e8a012',
                        mb: 1.5,
                      }}
                    />
                    <Typography
                      variant="subtitle1"
                      component="h3"
                      sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}
                    >
                      {t(titleKey)}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.secondary', lineHeight: 1.7 }}
                    >
                      {t(descKey)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ---- Screenshot ---- */}
      <Box sx={{ py: { xs: 6, md: 10 }, px: 3 }}>
        <Container maxWidth="md">
          <Box
            sx={{
              width: '100%',
              borderRadius: 3,
              border: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              overflow: 'hidden',
              boxShadow: isDark
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 8px 32px rgba(0,0,0,0.12)',
            }}
          >
            <Image
              src="/images/editor-preview.png"
              alt={t('screenshot')}
              width={2880}
              height={1800}
              priority
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          </Box>
        </Container>
      </Box>

      {/* ---- Footer ---- */}
      <Box
        component="footer"
        sx={{
          py: 4,
          px: 3,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Container
          maxWidth="lg"
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: { xs: 1.5, sm: 3 },
          }}
        >
          <MuiLink
            href="https://github.com/kiyotaka-ueda/anytime-markdown"
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            sx={{ color: 'text.secondary', fontSize: '0.85rem' }}
          >
            {t('footerGithub')}
          </MuiLink>
          <MuiLink
            href="https://marketplace.visualstudio.com/items?itemName=kiytaka-ueda.anytime-markdown"
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            sx={{ color: 'text.secondary', fontSize: '0.85rem' }}
          >
            {t('footerVscode')}
          </MuiLink>
          <MuiLink
            component={NextLink}
            href="/privacy"
            underline="hover"
            sx={{ color: 'text.secondary', fontSize: '0.85rem' }}
          >
            {t('footerPrivacy')}
          </MuiLink>
          <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.85rem' }}>
            {t('footerRights')}
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
