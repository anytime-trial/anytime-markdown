'use client';

import {
  Alert,
  Box,
  Card,
  CardContent,
  Container,
  Grid,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DescriptionIcon from '@mui/icons-material/Description';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import LandingHeader from '../components/LandingHeader';
import SiteFooter from '../components/SiteFooter';
import type { LayoutCategory } from '../../types/layout';

interface SitesBodyProps {
  initialData: {
    categories: LayoutCategory[];
    siteDescription?: string;
    error?: boolean;
  };
}

export default function SitesBody({ initialData }: SitesBodyProps) {
  const t = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const categories = initialData.categories;
  const siteDescription = initialData.siteDescription ?? '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LandingHeader />

      {/* Hero Section */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          py: { xs: 6, md: 10 },
          px: 2,
          textAlign: 'center',
          background: isDark
            ? 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(232,160,18,0.08) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(232,160,18,0.06) 0%, transparent 70%)',
        }}
      >
        <Container maxWidth="md">
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontWeight: 800,
              mb: siteDescription ? 2 : 0,
              color: 'text.primary',
              fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
              letterSpacing: '-0.02em',
            }}
          >
            {t('sitesPage')}
          </Typography>
          {siteDescription && (
            <Typography
              variant="h6"
              sx={{
                color: 'text.secondary',
                fontWeight: 400,
                lineHeight: 1.6,
                maxWidth: 600,
                mx: 'auto',
                fontSize: { xs: '1rem', md: '1.15rem' },
              }}
            >
              {siteDescription}
            </Typography>
          )}
        </Container>
      </Box>

      {/* Content */}
      <Container maxWidth="lg" sx={{ flex: 1, py: { xs: 4, md: 6 }, px: { xs: 2, md: 4 } }}>
        {initialData.error && <Alert severity="error" sx={{ mb: 2 }}>{t('sitesLoadError')}</Alert>}

        {!initialData.error && categories.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <DescriptionIcon aria-hidden="true" sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
              {t('sitesEmpty')}
            </Typography>
            <Typography variant="body2" color="text.disabled">
              {t('docsEmptyHint')}
            </Typography>
          </Box>
        )}

        {!initialData.error && categories.length > 0 && (
          <Grid container spacing={3}>
            {categories.map((category) => (
              <Grid key={category.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    border: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    borderRadius: 3,
                  }}
                >
                  <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                    <Typography
                      variant="h6"
                      component="h2"
                      sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}
                    >
                      {category.title}
                    </Typography>
                    {category.description && (
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', lineHeight: 1.7, mb: 2 }}
                      >
                        {category.description}
                      </Typography>
                    )}
                    {category.items.length > 0 && (
                      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {category.items.map((item) => {
                          const isExternal = item.url?.startsWith('http');
                          const href = item.url ?? `/docs/view?key=${encodeURIComponent(item.docKey)}`;
                          const linkProps = isExternal
                            ? { component: 'a' as const, href, target: '_blank', rel: 'noopener noreferrer' }
                            : { component: NextLink, href };

                          return (
                            <Box
                              component="li"
                              key={item.docKey}
                              sx={{ '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}
                            >
                              <Box
                                {...linkProps}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  py: 1,
                                  px: 0.5,
                                  color: 'text.primary',
                                  textDecoration: 'none',
                                  fontWeight: 500,
                                  fontSize: '0.875rem',
                                  borderRadius: 1,
                                  transition: 'background-color 0.15s',
                                  '&:hover': {
                                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                  },
                                  '& .arrow-icon': {
                                    opacity: 0,
                                    transform: 'translateX(-4px)',
                                    transition: 'opacity 0.15s, transform 0.15s',
                                  },
                                  '&:hover .arrow-icon': {
                                    opacity: 1,
                                    transform: 'translateX(0)',
                                  },
                                }}
                              >
                                <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.displayName}
                                </Box>
                                {isExternal ? (
                                  <OpenInNewIcon sx={{ fontSize: 14, flexShrink: 0, opacity: 0.6 }} />
                                ) : (
                                  <ArrowForwardIcon className="arrow-icon" sx={{ fontSize: 16, flexShrink: 0 }} />
                                )}
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
      <SiteFooter />
    </Box>
  );
}
