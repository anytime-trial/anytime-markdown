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
        aria-label="Footer navigation"
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
          href="/features"
          underline="hover"
          sx={{ color: 'text.secondary', fontSize: '0.85rem' }}
        >
          {t('featuresPage')}
        </MuiLink>
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
