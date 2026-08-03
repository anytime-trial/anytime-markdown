import { Box, Container, Divider, Stack, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';

import { Link } from '../../../i18n/navigation';
import { FaqJsonLd, type QandA } from './structuredData';
import { TOPIC_SLUGS, topicPath } from './topics';

/**
 * `/markdown` の本文セクション（server component）。
 *
 * エディタ画面はクライアント描画のツールで、サーバーが返す HTML にページの主題を
 * 説明する本文が無い。検索エンジンは本文の無いページに順位を付けられないため、
 * エディタの下へ実際に読める解説を置く（要件書
 * spec/10.web-app/markdown-ssr-content/markdown-ssr-content.ja.md）。
 *
 * 隠しテキスト（display:none・画面外配置）は使わない。クローキングにあたる。
 */

/** 機能セクションの項目。i18n のキー名と 1 対 1 で対応する */
const FEATURE_KEYS = [
  'wysiwyg',
  'diagram',
  'math',
  'table',
  'gfm',
  'code',
  'diff',
  'sync',
] as const;

const STEP_KEYS = ['open', 'write', 'save'] as const;

const FAQ_KEYS = ['signup', 'storage', 'syntax', 'vscode'] as const;

export async function MarkdownGuide() {
  const t = await getTranslations('Editor');
  // 記法別 LP は sitemap にしか経路が無いと孤立ページになる。本サイトで最も
  // 強いページであるここから辿れるようにする
  const tTopics = await getTranslations('EditorTopics');

  const faqItems: QandA[] = FAQ_KEYS.map((key) => ({
    question: t(`guide.faq.${key}.question`),
    answer: t(`guide.faq.${key}.answer`),
  }));

  return (
    <Box component="section" sx={{ borderTop: 1, borderColor: 'divider', py: { xs: 6, md: 8 } }}>
      <FaqJsonLd items={faqItems} />
      <Container maxWidth="md">
        <Stack spacing={6}>
          <Box>
            {/* ページ唯一の h1。エディタ画面には見出しが無く、この本文が
                文書のアウトラインの起点になる（h1 → h2 × 3 → h3）。 */}
            <Typography
              variant="h1"
              sx={{ fontSize: { xs: '1.75rem', md: '2rem' }, fontWeight: 700, mb: 2 }}
            >
              {t('guide.heading')}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t('guide.lead')}
            </Typography>
          </Box>

          <Box component="section">
            <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 600, mb: 3 }}>
              {t('guide.featuresHeading')}
            </Typography>
            <Stack spacing={3}>
              {FEATURE_KEYS.map((key) => (
                <Box key={key}>
                  <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600, mb: 0.5 }}>
                    {t(`guide.features.${key}.title`)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t(`guide.features.${key}.body`)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          <Divider />

          <Box component="section">
            <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 600, mb: 2 }}>
              {t('guide.topicsHeading')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('guide.topicsLead')}
            </Typography>
            <Stack component="ul" spacing={1} sx={{ pl: 3, m: 0 }}>
              {TOPIC_SLUGS.map((slug) => (
                <Box component="li" key={slug}>
                  <Link href={topicPath(slug)}>{tTopics(`${slug}.linkLabel`)}</Link>
                </Box>
              ))}
            </Stack>
          </Box>

          <Divider />

          <Box component="section">
            <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 600, mb: 3 }}>
              {t('guide.howtoHeading')}
            </Typography>
            <Stack component="ol" spacing={3} sx={{ pl: 3, m: 0 }}>
              {STEP_KEYS.map((key) => (
                <Box component="li" key={key}>
                  <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600, mb: 0.5 }}>
                    {t(`guide.steps.${key}.title`)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t(`guide.steps.${key}.body`)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          <Divider />

          <Box component="section">
            <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 600, mb: 3 }}>
              {t('guide.faqHeading')}
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
        </Stack>
      </Container>
    </Box>
  );
}
