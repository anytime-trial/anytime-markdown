'use client';

import { Box, Link as MuiLink, Typography } from '@mui/material';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';

export default function SiteFooter() {
  const t = useTranslations('Landing');

  return (
    <Box
      component="footer"
      sx={{
        py: 4,
        px: 3,
        borderTop: 1,
        borderColor: 'divider',
        mt: 'auto',
      }}
    >
      <Box
        component="nav"
        aria-label={t('ariaFooterNavigation')}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: { xs: 1.5, sm: 3 },
          maxWidth: 'lg',
          mx: 'auto',
          width: '100%',
        }}
      >
        <MuiLink
          href="https://github.com/anytime-trial/anytime-markdown"
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          sx={{ color: 'text.secondary', fontSize: '0.85rem' }}
        >
          {t('footerGithub')}
        </MuiLink>
        <MuiLink
          component={NextLink}
          href="/docs"
          underline="hover"
          sx={{ color: 'text.secondary', fontSize: '0.85rem' }}
        >
          {t('sitesPage')}
        </MuiLink>
        {process.env.NEXT_PUBLIC_ENABLE_DOCS_EDIT === 'true' && (
          <MuiLink
            component={NextLink}
            href="/docs/edit"
            underline="hover"
            sx={{ color: 'text.secondary', fontSize: '0.85rem' }}
          >
            {t('docsEditPage')}
          </MuiLink>
        )}
        <MuiLink
          component={NextLink}
          href="/privacy"
          underline="hover"
          sx={{ color: 'text.secondary', fontSize: '0.85rem' }}
        >
          {t('footerPrivacy')}
        </MuiLink>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
          {t('footerRights')}
        </Typography>
      </Box>
    </Box>
  );
}
