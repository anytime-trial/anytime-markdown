import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import NextLink from 'next/link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { getTranslations } from 'next-intl/server';
import SiteFooter from '../components/SiteFooter';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Privacy');
  return {
    title: `${t('title')} - Anytime Markdown`,
    description: t('metaDescription'),
    alternates: {
      canonical: '/privacy',
    },
  };
}

export default async function PrivacyPolicyPage() {
  const tLanding = await getTranslations('Landing');
  const t = await getTranslations('Privacy');

  return (
  <>
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Link
        component={NextLink}
        href="/"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 2, textDecoration: 'none', color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
      >
        <ArrowBackIcon sx={{ fontSize: 18 }} />
        {tLanding('backToHome')}
      </Link>
      <Typography variant="h3" component="h1" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {t('lastUpdated')}
      </Typography>

      <Section title={t('section1Title')}>
        <P>{t('section1Body')}</P>
      </Section>

      <Section title={t('section2Title')}>
        <P>{t.rich('section2Body', { strong: (chunks) => <strong>{chunks}</strong> })}</P>
      </Section>

      <Section title={t('section3Title')}>
        <P>{t('section3Body')}</P>
      </Section>

      <Section title={t('section4Title')}>
        <P>{t('section4Intro')}</P>
        <Box component="ul" sx={{ pl: 3 }}>
          <li>
            <P>{t.rich('section4Plantuml', { strong: (chunks) => <strong>{chunks}</strong> })}</P>
          </li>
        </Box>
      </Section>

      <Section title={t('section5Title')}>
        <P>{t('section5Body1')}</P>
        <P>{t('section5Body2')}</P>
      </Section>

      <Section title={t('section6Title')}>
        <P>{t('section6Body')}</P>
      </Section>

      <Section title={t('section7Title')}>
        <P>{t('section7Body')}</P>
      </Section>

      <Section title={t('section8Title')}>
        <P>
          {t.rich('section8Body', {
            link: (chunks) => (
              <Link
                href="https://github.com/kiyotaka-ueda/anytime-markdown/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                {chunks}
              </Link>
            ),
          })}
        </P>
      </Section>

    </Container>
    <SiteFooter />
  </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body1" paragraph sx={{ lineHeight: 1.8 }}>
      {children}
    </Typography>
  );
}
