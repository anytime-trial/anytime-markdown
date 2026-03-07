'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  Container,
  Grid,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import DescriptionIcon from '@mui/icons-material/Description';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import LandingHeader from '../components/LandingHeader';
import SiteFooter from '../components/SiteFooter';
import type { LayoutCard } from '../../types/layout';

interface SitesBodyProps {
  initialData: {
    cards: LayoutCard[];
    siteDescription?: string;
    error?: boolean;
  };
}

export default function SitesBody({ initialData }: SitesBodyProps) {
  const t = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const cards = initialData.cards;
  const siteDescription = initialData.siteDescription ?? '';

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    cards.forEach((c) => c.tags?.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [cards]);

  const filteredCards = useMemo(() => {
    if (!activeTag) return cards;
    return cards.filter((c) => c.tags?.includes(activeTag));
  }, [cards, activeTag]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LandingHeader />
      <Container maxWidth="lg" sx={{ flex: 1, py: 4, px: { xs: 2, md: 4 } }}>
        <Typography
          variant="h3"
          component="h1"
          sx={{
            fontWeight: 700,
            mb: siteDescription ? 1 : 4,
            color: 'text.primary',
            fontSize: { xs: '1.8rem', md: '2.4rem' },
          }}
        >
          {t('sitesPage')}
        </Typography>

        {siteDescription && (
          <Typography
            variant="body1"
            sx={{ color: 'text.secondary', mb: 4, lineHeight: 1.7 }}
          >
            {siteDescription}
          </Typography>
        )}

        {initialData.error && <Alert severity="error" sx={{ mb: 2 }}>{t('sitesLoadError')}</Alert>}

        {!initialData.error && cards.length === 0 && (
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

        {!initialData.error && cards.length > 0 && (
          <>
            {allTags.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
                <Chip
                  label={t('sitesFilterAll')}
                  icon={activeTag === null ? <CheckIcon fontSize="small" /> : undefined}
                  variant={activeTag === null ? 'filled' : 'outlined'}
                  onClick={() => setActiveTag(null)}
                  aria-pressed={activeTag === null}
                  sx={{
                    fontWeight: 600,
                    ...(activeTag === null && {
                      bgcolor: '#e8a012',
                      color: '#000000',
                      '&:hover': { bgcolor: '#d4920e' },
                    }),
                  }}
                />
                {allTags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    icon={activeTag === tag ? <CheckIcon fontSize="small" /> : undefined}
                    variant={activeTag === tag ? 'filled' : 'outlined'}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    aria-pressed={activeTag === tag}
                    sx={{
                      fontWeight: 600,
                      ...(activeTag === tag && {
                        bgcolor: '#e8a012',
                        color: '#000000',
                        '&:hover': { bgcolor: '#d4920e' },
                      }),
                    }}
                  />
                ))}
              </Box>
            )}

            <Grid container spacing={3}>
              {filteredCards.map((card) => (
                <Grid key={card.id} size={{ xs: 12, sm: 6, md: 4 }}>
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
                      transition: 'border-color 0.2s',
                      '&:hover': {
                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                      },
                    }}
                  >
                    <CardActionArea
                      component={NextLink}
                      href={`/docs/view?key=${encodeURIComponent(card.docKey)}`}
                      sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                    >
                      {card.thumbnail ? (
                        <CardMedia
                          component="img"
                          height={160}
                          image={card.thumbnail}
                          alt={card.title}
                          sx={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <Box
                          sx={{
                            height: 160,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)',
                          }}
                        >
                          <Avatar
                            sx={{
                              width: 64,
                              height: 64,
                              bgcolor: '#e8a012',
                              color: '#000000',
                              fontSize: '1.8rem',
                              fontWeight: 700,
                            }}
                          >
                            {card.title.charAt(0).toUpperCase()}
                          </Avatar>
                        </Box>
                      )}
                      <CardContent sx={{ flex: 1, p: 3.5 }}>
                        <Typography
                          variant="subtitle1"
                          component="h2"
                          sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}
                        >
                          {card.title}
                        </Typography>
                        {card.description && (
                          <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                            {card.description}
                          </Typography>
                        )}
                        {card.tags && card.tags.length > 0 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.5 }}>
                            {card.tags.map((tag) => (
                              <Chip
                                key={tag}
                                label={tag}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: '0.7rem', height: 22 }}
                              />
                            ))}
                          </Box>
                        )}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </Container>
      <SiteFooter />
    </Box>
  );
}
