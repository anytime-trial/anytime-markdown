'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';

import LandingHeader from '../../components/LandingHeader';

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function P({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Typography variant="body1" sx={{ lineHeight: 1.8, mb: 2 }}>
      {children}
    </Typography>
  );
}

const richStrong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

const richEditorPrivacyLink = (chunks: React.ReactNode) => (
  <Link component={NextLink} href="/privacy">
    {chunks}
  </Link>
);

const richIssueLink = (chunks: React.ReactNode) => (
  <Link
    href="https://github.com/anytime-trial/anytime-markdown/issues"
    target="_blank"
    rel="noopener noreferrer"
  >
    {chunks}
  </Link>
);

export default function PrivacyServicesBody() {
  const t = useTranslations('PrivacyServices');

  return (
    <Box sx={{ minHeight: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <LandingHeader />
      <Container maxWidth="md" sx={{ py: 6, flex: 1 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          {t('title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {t('lastUpdated')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t.rich('backToEditorPrivacy', { link: richEditorPrivacyLink })}
        </Typography>

        <Section title={t('section1Title')}>
          <P>{t('section1Body')}</P>
        </Section>

        <Section title={t('section2Title')}>
          <P>{t('section2Body')}</P>
        </Section>

        <Section title={t('section3Title')}>
          <P>{t('section3Body')}</P>
        </Section>

        <Section title={t('section4Title')}>
          <P>{t('section4Intro')}</P>
          <Box component="ul" sx={{ pl: 3 }}>
            <li>
              <P>{t.rich('section4ExternalData', { strong: richStrong })}</P>
            </li>
            <li>
              <P>{t.rich('section4Embeds', { strong: richStrong })}</P>
            </li>
            <li>
              <P>{t.rich('section4Plantuml', { strong: richStrong })}</P>
            </li>
          </Box>
        </Section>

        <Section title={t('section5Title')}>
          <P>{t('section5Body')}</P>
        </Section>

        <Section title={t('section6Title')}>
          <P>{t('section6Body')}</P>
        </Section>

        <Section title={t('section7Title')}>
          <P>{t('section7Body')}</P>
        </Section>

        <Section title={t('section8Title')}>
          <P>{t.rich('section8Body', { link: richIssueLink })}</P>
        </Section>
      </Container>
    </Box>
  );
}
