import { Box, Container, Divider, Stack, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Link } from '../../../../i18n/navigation';
import type { Locale } from '../../../../i18n/routing';
import { localeHref } from '../../../../lib/localeAlternates';
import { BreadcrumbJsonLd, FaqJsonLd, type QandA } from '../structuredData';
import { TOPIC_SLUGS, TOPICS, type TopicSlug, topicPath } from '../topics';
import { TopicCtaButton } from './TopicCtaButton';

/**
 * `/markdown/<topic>` の LP 本体（server component）。
 *
 * 読み物であってツールではない。ここでエディタは動かさず、CTA で `/markdown` へ送る
 * （要件書 spec/10.web-app/markdown-topic-lp/markdown-topic-lp.ja.md）。
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com';

/**
 * 説明文中のバックティック（`flowchart TD` など）を `code` 要素にする。
 *
 * 記法の解説なので、記法そのものと地の文が同じ見た目だと読み分けられない。
 * Markdown を解釈するのではなく、バックティックで区切るだけに留める（本文は
 * 自前の i18n なので外部入力ではないが、HTML を組み立てる経路自体を作らない）。
 */
function withInlineCode(text: string): ReactNode[] {
  return text.split('`').map((segment, index) =>
    index % 2 === 1 ? (
      // 分割後の並びは安定していて要素の入れ替えも起きないため index を鍵にしてよい
      <Box
        component="code"
        key={`code-${index}`}
        sx={{
          px: 0.5,
          borderRadius: 0.5,
          bgcolor: 'action.hover',
          fontFamily: 'monospace',
          fontSize: '0.9em',
        }}
      >
        {segment}
      </Box>
    ) : (
      <span key={`text-${index}`}>{segment}</span>
    ),
  );
}

function SampleBlock({ code }: Readonly<{ code: string }>) {
  return (
    <Box
      component="pre"
      sx={{
        // 長い行はページ本体ではなくこのブロックの中で横スクロールさせる
        overflowX: 'auto',
        p: 2,
        my: 1.5,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'action.hover',
        fontFamily: 'monospace',
        fontSize: '0.875rem',
        lineHeight: 1.7,
      }}
    >
      <code>{code}</code>
    </Box>
  );
}

interface TopicLandingProps {
  readonly slug: TopicSlug;
  readonly locale: Locale;
}

export async function TopicLanding({ slug, locale }: TopicLandingProps) {
  const t = await getTranslations({ locale, namespace: 'EditorTopics' });
  const topic = TOPICS[slug];

  const faqItems: QandA[] = topic.faqKeys.map((key) => ({
    question: t(`${slug}.faq.${key}.question`),
    answer: t(`${slug}.faq.${key}.answer`),
  }));

  const absolute = (path: string) => `${BASE_URL}${localeHref(path, locale)}`;
  const crumbs = [
    { name: t('common.breadcrumbHome'), url: absolute('/') },
    { name: t('common.breadcrumbEditor'), url: absolute('/markdown') },
    { name: t(`${slug}.linkLabel`), url: absolute(topicPath(slug)) },
  ];

  const otherSlugs = TOPIC_SLUGS.filter((other) => other !== slug);

  return (
    <Box component="main" sx={{ py: { xs: 6, md: 8 } }}>
      <FaqJsonLd items={faqItems} />
      <BreadcrumbJsonLd items={crumbs} />
      <Container maxWidth="md">
        <Stack spacing={6}>
          <Box>
            <Typography
              variant="h1"
              sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, fontWeight: 700, mb: 2 }}
            >
              {t(`${slug}.heading`)}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t(`${slug}.lead`)}
            </Typography>
          </Box>

          <Box component="section">
            <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 600, mb: 3 }}>
              {t('common.samplesHeading')}
            </Typography>
            <Stack spacing={4}>
              {topic.samples.map((sample) => (
                <Box key={sample.key}>
                  <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
                    {t(`${slug}.samples.${sample.key}.caption`)}
                  </Typography>
                  <SampleBlock code={sample.code} />
                  <Typography variant="body2" color="text.secondary">
                    {withInlineCode(t(`${slug}.samples.${sample.key}.note`))}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          <Divider />

          <Box component="section">
            <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 600, mb: 3 }}>
              {t('common.featuresHeading')}
            </Typography>
            <Stack spacing={3}>
              {topic.featureKeys.map((key) => (
                <Box key={key}>
                  <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600, mb: 0.5 }}>
                    {t(`${slug}.features.${key}.title`)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {withInlineCode(t(`${slug}.features.${key}.body`))}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          <Divider />

          <Box component="section">
            <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 600, mb: 3 }}>
              {t('common.faqHeading')}
            </Typography>
            <Stack spacing={3}>
              {faqItems.map((item) => (
                <Box key={item.question}>
                  <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600, mb: 0.5 }}>
                    {item.question}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.answer}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          <Box
            component="section"
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: 2,
              p: 3,
              borderRadius: 1,
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="body1" sx={{ flex: 1 }}>
              {t('common.ctaLead')}
            </Typography>
            <TopicCtaButton label={t('common.ctaLabel')} />
          </Box>

          <Box component="section">
            <Typography variant="h2" sx={{ fontSize: '1.25rem', fontWeight: 600, mb: 2 }}>
              {t('common.relatedHeading')}
            </Typography>
            <Stack component="ul" spacing={1} sx={{ pl: 3, m: 0 }}>
              {otherSlugs.map((other) => (
                <Box component="li" key={other}>
                  <Link href={topicPath(other)}>{t(`${other}.linkLabel`)}</Link>
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
