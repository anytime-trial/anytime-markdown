'use client';

import ArticleIcon from '@mui/icons-material/Article';
import {
  Box,
  Chip,
  Container,
  Divider,
  Grid,
  Pagination,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { buildArchiveMonths, paginate } from '../../lib/reportUtils';
import type { ReportMeta } from '../../types/report';
import LandingHeader from '../components/LandingHeader';
import SiteFooter from '../components/SiteFooter';

const PER_PAGE = 10;
const RECENT_COUNT = 5;

interface ReportListBodyProps {
  reports: ReportMeta[];
  currentPage: number;
  filterMonth?: string;
}

export default function ReportListBody({ reports, currentPage, filterMonth }: Readonly<ReportListBodyProps>) {
  const t = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const router = useRouter();

  // 月別フィルタ（YYYY-MM 形式のみ受け付ける）
  const validMonth = filterMonth && /^\d{4}-\d{2}$/.test(filterMonth) ? filterMonth : undefined;
  const filtered = useMemo(() => {
    if (!validMonth) return reports;
    return reports.filter((r) => r.date.startsWith(validMonth));
  }, [reports, validMonth]);

  const { items: pageItems, totalPages } = useMemo(
    () => paginate(filtered, currentPage, PER_PAGE),
    [filtered, currentPage],
  );
  const safePage = Math.max(1, Math.min(currentPage, totalPages));

  const recentPosts = useMemo(() => reports.slice(0, RECENT_COUNT), [reports]);
  const archiveMonths = useMemo(() => buildArchiveMonths(reports), [reports]);

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
              color: 'text.primary',
              fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
              letterSpacing: '-0.02em',
            }}
          >
            {t('reportPage')}
          </Typography>
        </Container>
      </Box>

      {/* Content */}
      <Container maxWidth="lg" sx={{ flex: 1, py: { xs: 4, md: 6 }, px: { xs: 2, md: 4 } }}>
        <Grid container spacing={4}>
          {/* Main Column */}
          <Grid size={{ xs: 12, md: 8 }}>
            {pageItems.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <ArticleIcon aria-hidden="true" sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary">
                  {t('reportEmpty')}
                </Typography>
              </Box>
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {pageItems.map((report, i) => (
                  <Box component="li" key={report.slug}>
                    {i > 0 && <Divider sx={{ my: 0 }} />}
                    <Box
                      component={NextLink}
                      href={`/report/${report.slug}`}
                      sx={{
                        display: 'block',
                        textDecoration: 'none',
                        py: 3,
                        px: 2,
                        borderRadius: '12px',
                        transition: 'background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        },
                      }}
                    >
                      {/* Date & Category */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                        <Typography
                          component="time"
                          sx={{ color: 'text.secondary', fontSize: '0.75rem', fontWeight: 500 }}
                        >
                          {report.date}
                        </Typography>
                        {report.category && (
                          <Chip
                            label={report.category}
                            size="small"
                            sx={{
                              height: 20,
                              bgcolor: 'rgba(232,160,18,0.15)',
                              color: '#E8A012',
                              fontWeight: 600,
                              fontSize: '0.7rem',
                              borderRadius: '4px',
                            }}
                          />
                        )}
                      </Box>

                      {/* Title */}
                      <Typography
                        variant="h6"
                        component="h2"
                        sx={{
                          color: '#90CAF9',
                          fontWeight: 700,
                          fontSize: { xs: '1rem', md: '1.15rem' },
                          mb: 0.5,
                          lineHeight: 1.4,
                        }}
                      >
                        {report.title}
                      </Typography>

                      {/* Author */}
                      {report.author && (
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem', mb: 1 }}>
                          {report.author}
                        </Typography>
                      )}

                      {/* Excerpt */}
                      {report.excerpt && (
                        <Typography
                          sx={{
                            color: 'text.secondary',
                            fontSize: '0.875rem',
                            lineHeight: 1.6,
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {report.excerpt}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
                <Pagination
                  count={totalPages}
                  page={safePage}
                  onChange={(_, page) => {
                    const params = new URLSearchParams();
                    if (page > 1) params.set('page', String(page));
                    if (validMonth) params.set('month', validMonth);
                    const qs = params.toString();
                    const url = qs ? `/report?${qs}` : '/report';
                    router.push(url);
                  }}
                  sx={{
                    '& .MuiPaginationItem-root': {
                      color: 'text.secondary',
                      '&.Mui-selected': {
                        bgcolor: 'rgba(144,202,249,0.15)',
                        color: '#90CAF9',
                      },
                    },
                  }}
                />
              </Box>
            )}
          </Grid>

          {/* Sidebar */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Box
              component="aside"
              sx={{
                position: { md: 'sticky' },
                top: { md: 80 },
              }}
            >
              {/* Recent Posts */}
              {recentPosts.length > 0 && (
                <Box sx={{ mb: 4 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: 'text.primary',
                      mb: 2,
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {t('reportRecentPosts')}
                  </Typography>
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {recentPosts.map((post) => (
                      <Box
                        component="li"
                        key={post.slug}
                        sx={{ '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}
                      >
                        <Box
                          component={NextLink}
                          href={`/report/${post.slug}`}
                          sx={{
                            display: 'block',
                            py: 1.5,
                            textDecoration: 'none',
                            color: 'text.primary',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            lineHeight: 1.4,
                            transition: 'color 0.15s',
                            '&:hover': { color: '#90CAF9' },
                          }}
                        >
                          {post.title}
                          <Typography component="span" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.7rem', mt: 0.25 }}>
                            {post.date}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Monthly Archive */}
              {archiveMonths.length > 0 && (
                <Box>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: 'text.primary',
                      mb: 2,
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {t('reportMonthlyArchive')}
                  </Typography>
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {archiveMonths.map(({ month, count }) => (
                      <Box
                        component="li"
                        key={month}
                        sx={{ '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}
                      >
                        <Box
                          component={NextLink}
                          href={`/report?month=${month}`}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            py: 1,
                            textDecoration: 'none',
                            color: validMonth === month ? '#90CAF9' : 'text.secondary',
                            fontSize: '0.85rem',
                            fontWeight: validMonth === month ? 600 : 400,
                            transition: 'color 0.15s',
                            '&:hover': { color: '#90CAF9' },
                          }}
                        >
                          <span>{month}</span>
                          <span>({count})</span>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>
      </Container>

      <SiteFooter />
    </Box>
  );
}
