'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  CircularProgress,
  Container,
  Link as MuiLink,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme } from '@mui/material/styles';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import LandingHeader from '../components/LandingHeader';
import SiteFooter from '../components/SiteFooter';
import { useLocaleSwitch } from '../LocaleProvider';

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'strong', 'em', 'code', 'pre',
    'a', 'blockquote', 'img',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'id', 'class'],
  ALLOW_DATA_ATTR: false,
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function processHtml(raw: string): { html: string; headings: { id: string; text: string; level: number }[] } {
  const headings: { id: string; text: string; level: number }[] = [];
  const processed = raw.replace(/<h([23])>(.*?)<\/h\1>/g, (_match, level: string, text: string) => {
    const plainText = text.replace(/<[^>]*>/g, '');
    const id = slugify(plainText);
    headings.push({ id, text: plainText, level: parseInt(level) });
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
  return { html: processed, headings };
}

/** Remove Shortcut columns from HTML tables */
function removeShortcutColumns(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.querySelectorAll('table').forEach((table) => {
    const headers = table.querySelectorAll('thead th, tr:first-child th');
    const shortcutIndices: number[] = [];
    headers.forEach((th, i) => {
      const text = th.textContent?.trim() ?? '';
      if (/^(shortcut|ショートカット)$/i.test(text)) {
        shortcutIndices.push(i);
      }
    });
    if (shortcutIndices.length === 0) return;
    table.querySelectorAll('tr').forEach((tr) => {
      const cells = tr.querySelectorAll('th, td');
      // Remove in reverse order to preserve indices
      for (let i = shortcutIndices.length - 1; i >= 0; i--) {
        cells[shortcutIndices[i]]?.remove();
      }
    });
  });
  return doc.body.innerHTML;
}

export default function FeaturesBody() {
  const { locale } = useLocaleSwitch();
  const t = useTranslations('Landing');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [rawHtml, setRawHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/help/help-${locale}.md`)
      .then((res) => res.text())
      .then((md) => {
        if (cancelled) return;
        const result = marked.parse(md);
        if (typeof result === 'string') {
          setRawHtml(result);
          setLoading(false);
        } else {
          result.then((html) => {
            if (!cancelled) {
              setRawHtml(html);
              setLoading(false);
            }
          });
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [locale]);

  const { html, headings } = useMemo(() => {
    const withoutShortcuts = removeShortcutColumns(rawHtml);
    const processed = processHtml(withoutShortcuts);
    return {
      html: DOMPurify.sanitize(processed.html, SANITIZE_CONFIG),
      headings: processed.headings,
    };
  }, [rawHtml]);

  const handleTocClick = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.setAttribute('tabindex', '-1');
      (el as HTMLElement).focus();
    }
  }, []);

  return (
    <Box sx={{ bgcolor: 'background.default', height: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <LandingHeader />

      <Container maxWidth="lg" sx={{ flex: 1, py: 4, px: { xs: 2, md: 4 } }}>
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
          {t('featuresPage')}
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 4 }}>
          {t('featuresDescription')}
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Box ref={contentRef} sx={{ display: 'flex', gap: 4 }}>
            {/* TOC sidebar */}
            <Box
              component="nav"
              aria-label={locale === 'ja' ? '目次' : 'Table of contents'}
              sx={{
                width: 200,
                minWidth: 200,
                position: 'sticky',
                top: 80,
                alignSelf: 'flex-start',
                maxHeight: 'calc(100vh - 100px)',
                overflow: 'auto',
                display: { xs: 'none', md: 'block' },
                borderRight: 1,
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="caption"
                sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'block', fontWeight: 600, color: 'text.secondary' }}
              >
                {locale === 'ja' ? '目次' : 'Contents'}
              </Typography>
              <List dense disablePadding>
                {headings.map((h) => (
                  <ListItemButton
                    key={h.id}
                    onClick={() => handleTocClick(h.id)}
                    sx={{ py: 0.25, pl: h.level === 3 ? 3 : 2, pr: 1 }}
                  >
                    <ListItemText
                      primary={h.text}
                      primaryTypographyProps={{ fontSize: '0.75rem', lineHeight: 1.4, noWrap: true }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>

            {/* Main content */}
            <Box
              dangerouslySetInnerHTML={{ __html: html }}
              sx={{ flex: 1, minWidth: 0, ...getContentSx(isDark) }}
            />
          </Box>
        )}
      </Container>

      <SiteFooter />
    </Box>
  );
}

function getContentSx(isDark: boolean) {
  return {
    '& h2': {
        fontWeight: 700,
        fontSize: '1.25rem',
        mt: 4,
        mb: 1.5,
        pt: 2,
        borderTop: 1,
        borderColor: 'divider',
        '&:first-of-type': { mt: 0, borderTop: 'none', pt: 0 },
      },
      '& h3': {
        fontWeight: 600,
        fontSize: '1.05rem',
        mt: 3,
        mb: 1,
      },
      '& p': {
        fontSize: '0.925rem',
        mb: 1.5,
        lineHeight: 1.7,
      },
      '& img': {
        maxWidth: '100%',
        height: 'auto',
        border: 1,
        borderColor: 'divider',
        borderStyle: 'solid',
        borderRadius: '6px',
        my: 2,
        display: 'block',
        boxShadow: isDark
          ? '0 2px 12px rgba(0,0,0,0.3)'
          : '0 2px 12px rgba(0,0,0,0.08)',
      },
      '& table': {
        width: '100%',
        borderCollapse: 'collapse' as const,
        mb: 2,
        fontSize: '0.875rem',
      },
      '& th, & td': {
        border: 1,
        borderColor: 'divider',
        borderStyle: 'solid',
        px: 1.5,
        py: 0.75,
        textAlign: 'left',
        lineHeight: 1.6,
      },
      '& th': {
        fontWeight: 600,
        bgcolor: 'action.hover',
      },
      '& ul, & ol': {
        pl: 3,
        mb: 2,
        '& li': {
          mb: 0.5,
          fontSize: '0.925rem',
          lineHeight: 1.7,
        },
      },
      '& code': {
        bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        px: 0.75,
        py: 0.25,
        borderRadius: '4px',
        fontSize: '0.85em',
        fontFamily: 'monospace',
      },
      '& pre': {
        bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        p: 2,
        borderRadius: '6px',
        overflow: 'auto',
        mb: 2,
        '& code': {
          bgcolor: 'transparent',
          px: 0,
          py: 0,
        },
      },
      '& a': {
        color: '#e8a012',
        textDecoration: 'none',
        '&:hover': { textDecoration: 'underline' },
      },
      '& blockquote': {
        borderLeft: 3,
        borderColor: '#e8a012',
        pl: 2,
        ml: 0,
        my: 2,
        color: 'text.secondary',
      },
    };
}
